import assert from 'node:assert/strict';
import fs from 'node:fs';

const {
  FIREBASE_REQUEST_TIMEOUT_CODE,
  FirebaseRequestTimeoutError,
  firebaseFetch,
  readFirebaseResponseText,
  isFirebaseRequestTimeout,
} = await import('../src/services/firebaseHttp.ts');

const rest = fs.readFileSync('src/services/firebaseRest.ts', 'utf8');
const auth = fs.readFileSync('src/services/verifiedEmailBetaAuth.ts', 'utf8');
const gate = fs.readFileSync('src/components/BackendGate.tsx', 'utf8');
const listings = fs.readFileSync('src/components/V2ListingsHydrator.tsx', 'utf8');
const nearby = fs.readFileSync('src/components/V2NearbyListingsHydrator.tsx', 'utf8');

assert.match(rest, /import \{ firebaseFetch \} from '\.\/firebaseHttp'/);
assert.match(auth, /import \{ firebaseFetch, isFirebaseRequestTimeout \} from '\.\/firebaseHttp'/);
assert.doesNotMatch(rest, /\bfetch\s*\(/);
assert.doesNotMatch(auth, /\bfetch\s*\(/);
assert.match(gate, /FIREBASE_REQUEST_TIMEOUT/);
assert.match(auth, /if \(isFirebaseRequestTimeout\(error\)\) throw error;[\s\S]*accounts:delete/);

assert.match(listings, /finally \{\s*inFlight = false;[\s\S]*?if \(replay\) void sync\(true\);\s*\}/);
assert.match(listings, /if \(inFlight\) \{ queuedRefresh = true; return; \}/);
assert.match(listings, /ownerEpoch === expectedEpoch && useAppStore\.getState\(\)\.user\.id === expectedUid/);
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
      assert.equal(isFirebaseRequestTimeout(error), true);
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


// When the HTTP adapter stalls despite AbortSignal, a user's cancellation
// must reject immediately with their reason and allow the next call to work.
const blockedFetch = globalThis.fetch;
try {
  let transportInvocations = 0;
  globalThis.fetch = async (_url, init) => {
    transportInvocations += 1;
    assert.ok(init.signal instanceof AbortSignal);
    return await new Promise(() => {});
  };
  const abortController = new AbortController();
  const cancelledRequest = firebaseFetch(
    'https://example.test/user-cancelled', { signal: abortController.signal }, 5_000);
  const cancelStarted = Date.now();
  abortController.abort(new Error('synthetic caller cancellation'));
  await assert.rejects(cancelledRequest, /synthetic caller cancellation/);
  assert.ok(Date.now() - cancelStarted < 500,
    'upstream cancellation must not wait for the Firebase timeout');

  const preCancelled = new AbortController();
  preCancelled.abort(new Error('synthetic already aborted'));
  await assert.rejects(
    firebaseFetch('https://example.test/already-cancelled',
      { signal: preCancelled.signal }, 5_000),
    /synthetic already aborted/,
  );
  assert.equal(transportInvocations, 1,
    'pre-aborted request must never invoke fetch (only earlier in-flight request ran)');
  assert.match(fs.readFileSync('src/services/firebaseHttp.ts', 'utf8'),
    /if \(upstream\?\.aborted\) throw upstream\.reason/,
    'abort preflight must happen before any request transport');
} finally {
  globalThis.fetch = blockedFetch;
}

// Invalid/non-finite/overflowing timeout inputs must not accidentally
// schedule a 1 ms timer and classify a healthy request as timed out.
const networkBeforeMalformedTimeouts = globalThis.fetch;
try {
  let validResponses = 0;
  globalThis.fetch = async () => {
    await new Promise(resolve => setTimeout(resolve, 12));
    validResponses += 1;
    return new Response('synthetic-ok', { status: 200 });
  };
  for (const invalidMs of [Number.NaN, Infinity, 3_000_000_000]) {
    const healthy = await firebaseFetch('https://example.test/valid-timeout', {}, invalidMs);
    assert.equal(healthy.status, 200, 'invalid timer must not abort a healthy Firebase transport');
  }
  assert.equal(validResponses, 3);
} finally {
  globalThis.fetch = networkBeforeMalformedTimeouts;
}
for (const invalidMs of [Number.NaN, Infinity, 3_000_000_000]) {
  const body = await readFirebaseResponseText({
    text: () => new Promise(resolve => setTimeout(() => resolve('synthetic-body'), 12)),
  }, invalidMs);
  assert.equal(body, 'synthetic-body', 'invalid timer must not abort healthy body read');
}
// Headers can complete while the body itself stalls; both clients must fail bounded.
const responseBodyStarted = Date.now();
await assert.rejects(
  readFirebaseResponseText({ text: () => new Promise(() => {}) }, 25),
  (error) => {
    assert.ok(error instanceof FirebaseRequestTimeoutError);
    assert.equal(error.message, FIREBASE_REQUEST_TIMEOUT_CODE);
    assert.equal(error.retryable, true);
    assert.equal(error.timeoutMs, 25);
    return true;
  },
);
assert.ok(Date.now() - responseBodyStarted < 500, 'response body must not hang indefinitely');
assert.equal(await readFirebaseResponseText({ text: async () => '{"ok":true}' }, 25), '{"ok":true}');
await assert.rejects(
  readFirebaseResponseText({ text: async () => { throw new Error('synthetic body read failure'); } }, 25),
  /synthetic body read failure/,
);
assert.match(rest, /await readFirebaseResponseText\(response\)/);
assert.match(auth, /await readFirebaseResponseText\(response\)/);
assert.doesNotMatch(rest, /const text = await response\.text\(\)/);
assert.doesNotMatch(auth, /const text = await response\.text\(\)/);
console.log('PASS Firebase response body timeout: stalled body bounded, success and failure semantics retained, both clients wired');

console.log('PASS Firebase request timeout: stalled network is bounded/retryable and a later request recovers');
