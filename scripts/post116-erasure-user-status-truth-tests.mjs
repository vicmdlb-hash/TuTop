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
assert.equal(hasTrustedAccountDeletionCompletion({ ...proven, completed_at: 'not-a-date' }), false);

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
