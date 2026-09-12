import assert from 'node:assert/strict';
import fs from 'node:fs';
import { LocalRecoveryProviderSimulation } from './recovery-local-provider-simulation.mjs';

const now = 1_800_000_000_000;
const sim = new LocalRecoveryProviderSimulation();
const issued = sim.issue({ identifier: 'synthetic-user', channel: 'verified_email', correlation_id: 'recovery-contract-001', now });
assert.match(issued.challenge_id, /^sim-[a-f0-9]{20}$/);
assert.match(issued.synthetic_code, /^\d{6}$/);
assert.equal(sim.verify({ challenge_id: issued.challenge_id, code: '000000', now: now + 1 }).accepted, false);
const ok = sim.verify({ challenge_id: issued.challenge_id, code: issued.synthetic_code, now: now + 2 });
assert.equal(ok.accepted, true);
assert.equal(ok.reason, 'verified');
assert.equal(sim.verify({ challenge_id: issued.challenge_id, code: issued.synthetic_code, now: now + 3 }).reason, 'consumed');

const expired = sim.issue({ identifier: 'synthetic-user-2', channel: 'verified_sms', correlation_id: 'recovery-contract-002', now });
assert.equal(sim.verify({ challenge_id: expired.challenge_id, code: expired.synthetic_code, now: expired.expires_at + 1 }).reason, 'expired');

const locked = sim.issue({ identifier: 'synthetic-user-3', channel: 'recovery_code', correlation_id: 'recovery-contract-003', now });
for (let i = 0; i < 2; i++) assert.equal(sim.verify({ challenge_id: locked.challenge_id, code: '111111', now: now + i }).reason, 'invalid');
assert.equal(sim.verify({ challenge_id: locked.challenge_id, code: '111111', now: now + 3 }).reason, 'locked');
assert.equal(sim.verify({ challenge_id: locked.challenge_id, code: locked.synthetic_code, now: now + 4 }).reason, 'locked');

const source = fs.readFileSync('scripts/recovery-local-provider-simulation.mjs', 'utf8');
assert.doesNotMatch(source, /fetch\(|axios|https?:\/\//);
assert.match(source, /timingSafeEqual/);
assert.match(source, /MAX_VERIFY_ATTEMPTS = 3/);
assert.match(source, /TTL_MS = 10 \* 60_000/);

console.log('PASS local simulation verifies valid challenge without external provider');
console.log('PASS replay, expiry and brute-force attempts are blocked');
console.log('PASS simulation performs no external network calls');
console.log('Local recovery provider simulation: PASS');
