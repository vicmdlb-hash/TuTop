import assert from 'node:assert/strict';
import { ACCOUNT_RECOVERY_POLICY, evaluateRecoveryRateLimit, publicRecoveryResponse } from '../src/lib/accountRecoveryPolicy.ts';
import { accountRecoveryReadiness, startForgottenPasswordRecovery } from '../src/services/accountRecoveryOrchestrator.ts';

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

const readiness = accountRecoveryReadiness();
assert.equal(readiness.provider, 'disabled');
assert.equal(readiness.requires_verified_channel, true);
assert.deepEqual(readiness.supported_channels, []);

const attempt = await startForgottenPasswordRecovery('2461234567');
assert.equal(attempt.accepted, false);
assert.match(attempt.public_message, /no se enviará un SMS o correo ficticio/i);
assert.match(publicRecoveryResponse(), /no confirma si una cuenta existe/i);

console.log('PASS recovery attempts are rate-limited');
console.log('PASS repeated failed challenges trigger a temporary lock');
console.log('PASS zero-cost beta exposes no fake recovery provider');
console.log('PASS public response resists account enumeration');
console.log('Account recovery architecture: PASS');
