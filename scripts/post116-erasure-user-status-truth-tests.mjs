import assert from 'node:assert/strict';
import fs from 'node:fs';
import { hasTrustedAccountDeletionCompletion } from '../src/lib/accountDeletionCompletionTruth.ts';

const base = {
  uid: 'alice',
  status: 'completed',
  requested_at: '2026-09-19T00:00:00.000Z',
  updated_at: '2026-09-19T01:00:00.000Z',
};

assert.equal(hasTrustedAccountDeletionCompletion(base), false, 'bare completed status must fail closed');
assert.equal(hasTrustedAccountDeletionCompletion({ ...base, auth_deleted: true }), false, 'auth deletion alone is insufficient');

const proven = {
  ...base,
  completed_at: '2026-09-19T01:00:00.000Z',
  erasure_policy_version: 'staging-account-erasure-v1',
  residual_manifest_version: 'staging-erasure-residual-v2',
  processor_run_id: 'run-12345',
  deleted_count: 14,
  withdrawn_count: 3,
  retained_count: 7,
  auth_deleted: true,
};
assert.equal(hasTrustedAccountDeletionCompletion(proven), true, 'complete proof bundle must pass');
assert.equal(hasTrustedAccountDeletionCompletion({ ...proven, processor_run_id: '' }), false);
assert.equal(hasTrustedAccountDeletionCompletion({ ...proven, auth_deleted: false }), false);
assert.equal(hasTrustedAccountDeletionCompletion({ ...proven, deleted_count: -1 }), false);
assert.equal(hasTrustedAccountDeletionCompletion({ ...proven, retained_count: 1.5 }), false);
assert.equal(hasTrustedAccountDeletionCompletion({ ...proven, deleted_count: Number.MAX_SAFE_INTEGER + 1 }), false,
  'rounded 64-bit Firestore counts must not be accepted as verified evidence');
assert.equal(hasTrustedAccountDeletionCompletion({ ...proven, withdrawn_count: Number.POSITIVE_INFINITY }), false);
assert.equal(hasTrustedAccountDeletionCompletion({ ...proven, retained_count: Number.MAX_SAFE_INTEGER }), true,
  'largest safely representable integer stays valid');

assert.equal(hasTrustedAccountDeletionCompletion({ ...proven, completed_at: 'not-a-date' }), false);
assert.equal(hasTrustedAccountDeletionCompletion({ ...proven, requested_at: undefined }), false,
  'completed is not trustworthy without an original request timestamp');
assert.equal(hasTrustedAccountDeletionCompletion({ ...proven, completed_at: '2026-09-18T23:59:59.000Z' }), false,
  'an erasure cannot precede the request');
assert.equal(hasTrustedAccountDeletionCompletion({ ...proven, completed_at: '2099-01-01T00:00:00.000Z' }), false,
  'future-dated erasure should fail closed');
assert.equal(hasTrustedAccountDeletionCompletion({ ...proven, requested_at: 'not-a-date' }), false);
assert.equal(hasTrustedAccountDeletionCompletion({
  ...proven, requested_at: '2026-02-01T00:00:00.000Z',
  completed_at: '2026-02-31T01:00:00.000Z',
}), false, 'calendar-normalized impossible completion must never count as evidence');
assert.equal(hasTrustedAccountDeletionCompletion({
  ...proven, requested_at: '2026-02-31T00:00:00.000Z',
  completed_at: '2026-09-19T01:00:00.000Z',
}), false, 'calendar-normalized impossible request must never be accepted');
assert.equal(hasTrustedAccountDeletionCompletion({
  ...proven, requested_at: '2024-02-29T00:00:00.000Z',
  completed_at: '2024-02-29T01:00:00.000Z',
}), true, 'real leap-day completion remains valid');

assert.equal(hasTrustedAccountDeletionCompletion({ ...proven, completed_at: '2026-09-19' }), false,
  'completion must use a full ISO timestamp');
assert.equal(hasTrustedAccountDeletionCompletion({
  ...proven, completed_at: new Date(Date.now() + 10 * 60_000).toISOString(),
}), false, 'postdated erasure outside clock-skew tolerance must fail');


const controls = fs.readFileSync('src/components/NationalAccountControls.tsx', 'utf8');
assert.match(controls, /hasTrustedAccountDeletionCompletion\(deletion\)/);
assert.match(controls, /completada con evidencia verificada/);
assert.match(controls, /procesamiento pendiente de verificación/);
assert.match(controls, /no mostrará esta solicitud como completada/);

const adminQueue = fs.readFileSync('src/admin/AccountDeletionQueue.tsx', 'utf8');
assert.doesNotMatch(adminQueue, /Marcar completada/);
assert.match(adminQueue, /sólo el procesador controlado puede cerrar la solicitud/);

const backend = fs.readFileSync('src/services/scopedAdminBackend.ts', 'utf8');
assert.doesNotMatch(backend, /status: 'processing' \| 'completed' \| 'rejected'/);
assert.match(backend, /status: 'processing' \| 'rejected'/);

console.log('PASS account deletion completion truth is fail-closed in admin path and user-facing status');
