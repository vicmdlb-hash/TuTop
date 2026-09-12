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
