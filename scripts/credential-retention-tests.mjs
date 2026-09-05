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

console.log('PASS pending verification evidence is retained for review');
console.log('PASS no deletion occurs without an explicit valid deadline');
console.log('PASS approved/rejected credential images purge only after deadline');
console.log('Credential retention tests: PASS');
