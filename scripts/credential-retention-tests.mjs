import assert from 'node:assert/strict';
import { credentialRetentionPlan } from '../src/lib/credentialRetention.ts';

const now = Date.parse('2026-09-05T18:00:00.000Z');

assert.equal(credentialRetentionPlan({ status: 'pending', hasImageData: true }, now).reason, 'pending_review');
assert.equal(credentialRetentionPlan({ status: 'approved', hasImageData: false }, now).reason, 'no_image_data');
assert.equal(credentialRetentionPlan({ status: 'approved', hasImageData: true }, now).reason, 'retention_deadline_missing');
assert.equal(credentialRetentionPlan({ status: 'rejected', hasImageData: true, retentionDeleteAfter: 'invalid' }, now).reason, 'retention_deadline_invalid');
assert.equal(credentialRetentionPlan({ status: 'approved', hasImageData: true, retentionDeleteAfter: '2026-09-06T18:00:00.000Z' }, now).reason, 'retention_window_active');
assert.deepEqual(
  credentialRetentionPlan({ status: 'approved', hasImageData: true, retentionDeleteAfter: '2026-09-04T18:00:00.000Z' }, now),
  { kind: 'delete_image_data', reason: 'retention_deadline_reached' },
);
assert.deepEqual(
  credentialRetentionPlan({ status: 'rejected', hasImageData: true, retentionDeleteAfter: '2026-09-05T18:00:00.000Z' }, now),
  { kind: 'delete_image_data', reason: 'retention_deadline_reached' },
);

// Firestore snapshots are runtime data, not guaranteed to obey TypeScript
// unions. Malformed status/clock/boolean values must never authorize purge.
const expired = '2026-09-04T18:00:00.000Z';
for (const status of [undefined, null, 'processing', 'unknown', 'APPROVED', '', false]) {
  assert.deepEqual(
    credentialRetentionPlan({ status, hasImageData: true, retentionDeleteAfter: expired }, now),
    { kind: 'none', reason: 'retention_status_invalid' },
    'unexpected verification status must retain images',
  );
}
for (const nowMs of [Number.NaN, Infinity, -Infinity, -1, 1.5, null, '2026-09-05']) {
  assert.deepEqual(
    credentialRetentionPlan({ status: 'approved', hasImageData: true, retentionDeleteAfter: expired }, nowMs),
    { kind: 'none', reason: 'retention_clock_invalid' },
    'invalid wall-clock value must retain images',
  );
}
for (const hasImageData of [undefined, null, 1, 'true', {}, false]) {
  assert.equal(
    credentialRetentionPlan({ status: 'approved', hasImageData, retentionDeleteAfter: expired }, now).kind,
    'none', 'unverified image-present flag must not authorize purge',
  );
}
for (const input of [null, undefined, [], false, 'malformed']) {
  assert.deepEqual(credentialRetentionPlan(input, now),
    { kind: 'none', reason: 'retention_input_invalid' },
    'invalid imported record must not authorize purge');
}
for (const retentionDeleteAfter of [42, {}, [], true]) {
  assert.deepEqual(
    credentialRetentionPlan({ status: 'rejected', hasImageData: true, retentionDeleteAfter }, now),
    { kind: 'none', reason: 'retention_deadline_invalid' },
    'invalid deadline type must retain images',
  );
}
console.log('PASS untrusted retention status, clock, image flag and deadline type cannot authorize purge');

console.log('PASS pending verification evidence is retained for review');
console.log('PASS no deletion occurs without an explicit valid deadline');
console.log('PASS approved/rejected credential images purge only after deadline');
console.log('Credential retention tests: PASS');
