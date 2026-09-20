import assert from 'node:assert/strict';
import fs from 'node:fs';

const {
  FIREBASE_REQUEST_TIMEOUT_CODE,
  FirebaseRequestTimeoutError,
  firebaseFetch,
} = await import('../src/services/firebaseHttp.ts');

const rest = fs.readFileSync('src/services/firebaseRest.ts', 'utf8');
const auth = fs.readFileSync('src/services/verifiedEmailBetaAuth.ts', 'utf8');
const gate = fs.readFileSync('src/components/BackendGate.tsx', 'utf8');
const listings = fs.readFileSync('src/components/V2ListingsHydrator.tsx', 'utf8');
const nearby = fs.readFileSync('src/components/V2NearbyListingsHydrator.tsx', 'utf8');

assert.match(rest, /import \{ firebaseFetch \} from '\.\/firebaseHttp'/);
assert.match(auth, /import \{ firebaseFetch \} from '\.\/firebaseHttp'/);
assert.doesNotMatch(rest, /\bfetch\s*\(/);
assert.doesNotMatch(auth, /\bfetch\s*\(/);
assert.match(gate, /FIREBASE_REQUEST_TIMEOUT/);

assert.match(listings, /finally \{\s*inFlight = false;\s*\}/);
assert.match(listings, /window\.addEventListener\('online', online\)/);
assert.match(listings, /document\.addEventListener\('visibilitychange', visible\)/);
assert.match(nearby, /const serial = \+\+requestSerial/);
assert.match(nearby, /serial !== requestSerial/);

const originalFetch = globalThis.fetch;
try {
  let stalledCalls = 0;
  globalThis.fetch = async () => {
    stalledCalls += 1;
    return await new Promise(() => {});
  };

  const started = Date.now();
  await assert.rejects(
    firebaseFetch('https://example.test/stalled', {}, 25),
    (error) => {
      assert.ok(error instanceof FirebaseRequestTimeoutError);
      assert.equal(error.message, FIREBASE_REQUEST_TIMEOUT_CODE);
      assert.equal(error.code, FIREBASE_REQUEST_TIMEOUT_CODE);
      assert.equal(error.retryable, true);
      assert.equal(error.timeoutMs, 25);
      return true;
    },
  );
  assert.equal(stalledCalls, 1);
  assert.ok(Date.now() - started < 500, 'stalled request must have a bounded lifetime');

  let recoveredCalls = 0;
  globalThis.fetch = async () => {
    recoveredCalls += 1;
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  const recovered = await firebaseFetch('https://example.test/recovered', {}, 25);
  assert.equal(recovered.status, 200);
  assert.equal(recoveredCalls, 1);
  assert.deepEqual(await recovered.json(), { ok: true });
} finally {
  globalThis.fetch = originalFetch;
}

console.log('PASS Firebase request timeout: stalled network is bounded/retryable and a later request recovers');
