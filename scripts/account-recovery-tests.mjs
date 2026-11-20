import fs from 'node:fs';
import assert from 'node:assert/strict';
import { ACCOUNT_RECOVERY_POLICY, evaluateRecoveryRateLimit, publicRecoveryResponse } from '../src/lib/accountRecoveryPolicy.ts';
import { createRecoveryContractTestAdapter, runtimeRecoveryAdapter } from '../src/services/recoveryProviderAdapter.ts';

const orchestrator = fs.readFileSync('src/services/accountRecoveryOrchestrator.ts', 'utf8');
const adapterSource = fs.readFileSync('src/services/recoveryProviderAdapter.ts', 'utf8');
const now = 1_800_000_000_000;
const one = [{ at: now - 1_000, status: 'requested' }];
assert.equal(evaluateRecoveryRateLimit(one, now).allowed, true);

const limited = [0, 1, 2].map((index) => ({ at: now - index * 1_000, status: 'requested' }));
const limitedDecision = evaluateRecoveryRateLimit(limited, now);
assert.equal(limitedDecision.allowed, false);
assert.equal(limitedDecision.reason, 'rate_limited');
assert(limitedDecision.retry_after_ms > 0);

const failed = [0, 1, 2].map((index) => ({ at: now - index * 1_000, status: 'challenge_failed' }));
const locked = evaluateRecoveryRateLimit(failed, now);
assert.equal(locked.allowed, false);
assert.equal(locked.reason, 'temporarily_locked');
assert(locked.retry_after_ms <= ACCOUNT_RECOVERY_POLICY.temporary_lock_ms);
// A 30-minute lock must survive its triggering failures aging out of the 15-minute rate window.
for (const minutes of [15, 16, 29]) {
  const decision = evaluateRecoveryRateLimit(failed, now + minutes * 60_000);
  assert.equal(decision.allowed, false, 'premature recovery unlock');
  assert.equal(decision.reason, 'temporarily_locked');
}
assert.equal(evaluateRecoveryRateLimit(failed, now + 30 * 60_000).allowed, true);
// Detect a burst even when one triggering attempt is now older than 30 minutes.
const oldBurst = [29, 30, 31].map((min) => ({ at: now - min * 60_000, status: 'challenge_failed' }));
const remaining = evaluateRecoveryRateLimit(oldBurst, now);
assert.equal(remaining.allowed, false);
assert.equal(remaining.reason, 'temporarily_locked');
assert.equal(remaining.retry_after_ms, 60_000);
const scattered = [2, 20, 40].map((min) => ({ at: now - min * 60_000, status: 'challenge_failed' }));
assert.equal(evaluateRecoveryRateLimit(scattered, now).allowed, true);
console.log('PASS recovery lock lasts the full 30 minutes across the 15-minute rate window');


// A corrupted or untrusted clock/history must deny instead of treating the
// caller as fresh. No real account, provider or network is involved.
for (const invalidClock of [0, -1, NaN, Infinity, null, 'invalid']) {
  const decision = evaluateRecoveryRateLimit(limited, invalidClock);
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, 'temporarily_locked');
}
for (const invalidHistory of [
  null, {}, 'wrong-type', [null], [{ at: NaN, status: 'requested' }],
  [{ at: -1, status: 'requested' }],
  [{ at: now + 30_000, status: 'requested' }],
  [{ at: now - 1_000, status: 'unknown' }],
  Array.from({ length: 1001 }, () => ({ at: now - 1_000, status: 'requested' })),
]) {
  const decision = evaluateRecoveryRateLimit(invalidHistory, now);
  assert.equal(decision.allowed, false, 'invalid history must fail closed');
  assert.equal(decision.reason, 'temporarily_locked');
}
assert.equal(evaluateRecoveryRateLimit([], now).allowed, true,
  'a valid empty history is distinct from malformed history');
console.log('PASS malformed recovery timestamps and histories fail closed without contacting a provider');

const runtime = runtimeRecoveryAdapter();
assert.equal(runtime.name, 'disabled');
assert.deepEqual(runtime.channels, []);
await assert.rejects(() => runtime.start({ identifier: 'x', channel: 'verified_email', correlation_id: 'contract-1234' }), /RECOVERY_CHANNEL_UNAVAILABLE/);

const contract = createRecoveryContractTestAdapter();
for (const channel of ['verified_email', 'verified_sms', 'recovery_code']) {
  const result = await contract.start({ identifier: 'opaque-user-reference', channel, correlation_id: `contract-${channel.replaceAll('_', '-')}` });
  assert.equal(result.accepted, true);
}
assert.equal(contract.snapshotCalls().length, 3);

assert.match(orchestrator, /runtimeRecoveryAdapter/);
assert.match(orchestrator, /provider\.name === 'disabled'/);
assert.match(orchestrator, /requires_verified_channel: true/);
assert.match(orchestrator, /no se enviará un SMS o correo ficticio/i);
assert.match(adapterSource, /trusted_backend_only = true/);
assert.match(adapterSource, /Never switch this from client-side env flags/i);
assert.doesNotMatch(adapterSource, /api[_-]?key|client[_-]?secret|bearer\s+[A-Za-z0-9]/i);
assert.match(publicRecoveryResponse(), /no confirma si una cuenta existe/i);

console.log('PASS recovery attempts are rate-limited');
console.log('PASS repeated failed challenges trigger a temporary lock');
console.log('PASS runtime recovery provider remains deliberately disabled');
console.log('PASS contract-test adapter covers email, SMS and recovery-code interfaces without network calls');
console.log('PASS provider contract is trusted-backend-only and contains no provider secrets');
console.log('PASS public response resists account enumeration');
console.log('Account recovery architecture: PASS');
