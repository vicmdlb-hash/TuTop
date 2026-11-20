import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { buildAccountErasureFinalCommit, buildSyntheticErasureAdmissionReadPlan, buildSyntheticErasureAdmissionVerifyWrites, buildSyntheticErasureAdmissionBatchGetRequest, inspectSyntheticErasureAdmissionBatchGet } from './account-erasure-atomic-commit.mjs';
const now = new Date('2026-10-22T22:00:00Z');
const completed = {
  status:'completed',completed_at:now,updated_at:now,
  processing_note:'staging-controlled-erasure-v2',
  erasure_policy_version:'staging-account-erasure-v1',
  residual_manifest_version:'staging-erasure-residual-v2',
  processor_run_id:'run-99',deleted_count:12,withdrawn_count:4,
  retained_count:7,auth_deleted:true
};
const audit = {
  admin_uid:'trusted-runner',actor_type:'trusted_runner',role:'trust_safety',
  action:'account_erasure_completed',target_type:'account_deletion_request',
  target_id:'uid-synthetic',processor_run_id:'run-99',
  residual_manifest_version:'staging-erasure-residual-v2',created_at:now
};
const input = {
  projectId:'tutop-beta-vicmdlb-1356585881',uid:'uid-synthetic',
  processorRunId:'run-99',requestUpdateTime:'2026-10-22T21:59:00.001Z',
  completed,audit
};
const batch=buildAccountErasureFinalCommit(input);
assert.equal(batch.writes.length,2);
assert.equal(batch.writes[0].currentDocument.updateTime,input.requestUpdateTime);
assert.equal(batch.writes[0].update.fields.status.stringValue,'completed');
assert.equal(batch.writes[0].update.fields.auth_deleted.booleanValue,true);
assert.deepEqual(batch.writes[0].updateMask.fieldPaths,Object.keys(completed));
assert.equal(batch.writes[1].currentDocument.exists,false);
assert.equal(batch.writes[1].update.fields.target_id.stringValue,input.uid);
assert.equal(batch.writes[1].update.fields.processor_run_id.stringValue,input.processorRunId);
assert.equal(batch.writes[1].update.fields.created_at.timestampValue,now.toISOString());
for(const bad of [
  {projectId:'production'}, {uid:'not/valid'}, {processorRunId:''},
  {requestUpdateTime:''}, {completed:{...completed,auth_deleted:false}},
  {completed:{...completed,status:'processing'}},
  {completed:{...completed,processor_run_id:'other'}},
  {completed:{...completed,deleted_count:-1}},
  // A reviewer must be unable to pass contradictory or impersonated proof.
  {completed:{...completed,completed_at:new Date('2026-10-22T21:58:00Z')}},
  {completed:{...completed,updated_at:new Date('2026-10-22T22:00:01Z')}},
  {completed:{...completed,updated_at:'2026-10-22T22:00:00Z'}},
  {completed:{...completed,updated_at:new Date('invalid')}},
  {requestUpdateTime:'2026-10-22T22:01:00.000Z'},
  {audit:{...audit,actor_type:'client'}},
  {audit:{...audit,role:'seller'}},
  {audit:{...audit,admin_uid:'../../admin'}},
  {audit:{...audit,admin_uid:''}},
  {audit:{...audit,target_id:'other-user'}},
  {audit:{...audit,processor_run_id:'other'}},
  {audit:{...audit,residual_manifest_version:'other'}},
  {audit:{...audit,created_at:new Date('2026-10-22T22:01:00Z')}}
]) assert.throws(()=>buildAccountErasureFinalCommit({...input,...bad}),/ERASURE_ATOMIC_/);
// Firestore updateTime retains up to nanoseconds; milliseconds-only ordering
// can incorrectly accept a "completed" timestamp before a newer request edit.
for (const invalidUpdateTime of [
  '2026-02-31T21:59:00Z',
  '2026-10-22T21:59:00+00:00',
  '2026-10-22T21:59:00.1234567890Z',
  '2026-10-22 21:59:00Z',
  '2026-10-22T22:00:00.000000001Z',
]) {
  assert.throws(() => buildAccountErasureFinalCommit({
    ...input, requestUpdateTime: invalidUpdateTime,
  }), /ERASURE_ATOMIC_/);
}
assert.equal(buildAccountErasureFinalCommit({
  ...input, requestUpdateTime: '2026-10-22T21:59:00.123456789Z',
}).writes.length, 2, 'valid nine-digit Firestore updateTime remains supported');

const processor=fs.readFileSync('scripts/process-account-erasure.mjs','utf8');
const admin=fs.readFileSync('scripts/staging-v2-admin.mjs','utf8');
const del=processor.indexOf('await adminDeleteTestUsers([uid])');
const commit=processor.indexOf('await adminCommitAccountErasureCompletion(');
assert(del>=0&&commit>del,'Auth must be deleted before atomic completion');
assert.equal(processor.split('await adminCommitAccountErasureCompletion(').length-1,1,'exactly one atomic completion');
assert(processor.includes("if (status === 'pending') await adminPatchDocument(`account_deletion_requests/${uid}`, { status: 'processing'"));
assert(!processor.includes("await adminPatchDocument(`account_deletion_requests/${uid}`, {\n  status: 'completed'"));
assert(!processor.includes('await adminPatchDocument(`audit_log/account-erasure-'));
assert(admin.includes('current?.fields?.status?.stringValue !== \'processing\''));
assert(admin.includes('request(`${firestoreBase}:commit`'));
// Admission read plans are SOURCE-ONLY; not Firestore REST Writes and not wired to trusted writers.
const admission = {
  projectId: 'tutop-beta-vicmdlb-1356585881',
  participants: ['buyer-test-01', 'seller-test-01'],
  requestSnapshots: [
    { uid: 'buyer-test-01', document: null },
    { uid: 'seller-test-01', document: { status: 'rejected', updateTime: '2026-10-22T21:59:00.123456789Z' } },
  ],
};
assert.throws(() => buildSyntheticErasureAdmissionVerifyWrites(admission), /ERASURE_ADMISSION_REST_VERIFY_UNSUPPORTED/,
  'the obsolete REST verify Write API must fail closed');
const reads = buildSyntheticErasureAdmissionReadPlan(admission);
assert.equal(reads.length, 2);
assert.equal(reads[0].documentPath,
  'projects/tutop-beta-vicmdlb-1356585881/databases/(default)/documents/account_deletion_requests/buyer-test-01');
assert.deepEqual(reads[0].expected, { exists: false });
assert.deepEqual(reads[1].expected, { updateTime: '2026-10-22T21:59:00.123456789Z' });
assert(reads.every(w => w.kind === 'transaction_read' && !('update' in w) && !('delete' in w)
  && !('verify' in w) && !('currentDocument' in w)),
  'admission reads are model descriptors, NEVER REST writes');
// Pure model of snapshot comparisons, NOT a Firestore transaction or atomicity proof.
const syntheticCurrentDocumentMatches = (w, liveDoc) =>
  'exists' in w.expected ? liveDoc === null :
    liveDoc?.updateTime === w.expected.updateTime;
assert(syntheticCurrentDocumentMatches(reads[0], null));
assert(!syntheticCurrentDocumentMatches(reads[0], { status: 'pending', updateTime: '2026-10-22T22:00:00Z' }),
  'a deletion request inserted before the same commit invalidates exists:false');
assert(syntheticCurrentDocumentMatches(reads[1], admission.requestSnapshots[1].document));
assert(!syntheticCurrentDocumentMatches(reads[1], { status: 'pending', updateTime: '2026-10-22T22:00:00Z' }),
  'rejected→pending transition before commit must invalidate the stale version');
for (const altered of [
  { participants: [] },
  { participants: ['buyer-test-01', 'buyer-test-01'] },
  { participants: ['../admin'] },
  { projectId: 'production' },
  { requestSnapshots: [] },
  { requestSnapshots: [{ uid: 'buyer-test-01', document: null }, { uid: 'not-in-pair', document: null }] },
  { requestSnapshots: [{ uid: 'buyer-test-01', document: { status: 'pending', updateTime: '2026-10-22T21:59:00Z' } }, admission.requestSnapshots[1]] },
  { requestSnapshots: [{ uid: 'buyer-test-01', document: { status: 'processing', updateTime: '2026-10-22T21:59:00Z' } }, admission.requestSnapshots[1]] },
  { requestSnapshots: [{ uid: 'buyer-test-01', document: { status: 'completed', updateTime: '2026-10-22T21:59:00Z' } }, admission.requestSnapshots[1]] },
  { requestSnapshots: [{ uid: 'buyer-test-01', document: null }, { uid: 'seller-test-01', document: { status: 'rejected', updateTime: 'invalid' } }] },
]) assert.throws(() => buildSyntheticErasureAdmissionReadPlan({ ...admission, ...altered }), /ERASURE_(ADMISSION|ATOMIC)_/,
  'malformed or active deletion must never create an allowing witness');
const writer = fs.readFileSync('scripts/v2-trusted-maintenance.mjs', 'utf8');
const reconciler = fs.readFileSync('scripts/reconcile-v2-reservations.mjs', 'utf8');
assert(!writer.includes('buildSyntheticErasureAdmissionVerifyWrites')
  && !reconciler.includes('buildSyntheticErasureAdmissionVerifyWrites')
  && !writer.includes('buildSyntheticErasureAdmissionReadPlan')
  && !reconciler.includes('buildSyntheticErasureAdmissionReadPlan'),
  'prototype must not be wired into trusted remote writers before integrated safety review');
console.log('PASS non-writable admission read plan, obsolete REST verify API blocked, synthetic race comparisons; NO apply or atomicity proof');

console.log('PASS conditional account-erasure completion + audit are one atomic REST batch; synthetic/no Firebase');


// REST v1 transaction batchGet is modelled without credentials or network.
// Read-write is explicit: default newTransaction is READ-ONLY in Firestore.
const txRead = buildSyntheticErasureAdmissionBatchGetRequest({
  projectId: admission.projectId, participants: admission.participants,
});
const expectedBuyer = 'projects/tutop-beta-vicmdlb-1356585881/databases/(default)/documents/account_deletion_requests/buyer-test-01';
const expectedSeller = 'projects/tutop-beta-vicmdlb-1356585881/databases/(default)/documents/account_deletion_requests/seller-test-01';
assert.deepEqual(txRead, {
  documents: [expectedBuyer, expectedSeller],
  newTransaction: { readWrite: {} },
});
assert(!('writes' in txRead) && !('transaction' in txRead),
  'a source-only batchGet is not a Firestore Write or authenticated grant');
// Transaction IDs are only illustrative. They must never be printed or stored.
const txRow = { transaction: 'c3ludGhldGlj' };
const missingBuyer = { missing: expectedBuyer };
const rejectedSeller = {
  found: {
    name: expectedSeller, updateTime: '2026-10-22T21:59:00.123456789Z',
    fields: { status: { stringValue: 'rejected' } },
  },
};
const assess = rows => inspectSyntheticErasureAdmissionBatchGet({
  projectId: admission.projectId, participants: admission.participants, rows,
});
assert.deepEqual(assess([txRow, missingBuyer, rejectedSeller]), {
  kind: 'SOURCE_ONLY_NON_AUTHORITATIVE', inspectedDocuments: 2,
});
assert.deepEqual(assess([{ ...txRow, readTime: '2026-10-22T22:00:00Z' }, missingBuyer, rejectedSeller]), {
  kind: 'SOURCE_ONLY_NON_AUTHORITATIVE', inspectedDocuments: 2,
}, 'valid first-response readTime remains supported without storing transaction token');
assert.deepEqual(assess([
  { transaction: txRow.transaction, found: rejectedSeller.found },
  missingBuyer,
]), { kind: 'SOURCE_ONLY_NON_AUTHORITATIVE', inspectedDocuments: 2 },
  'batchGet can return documents out of requested order, and token with a found row');
assert.deepEqual(assess([txRow, { missing: expectedSeller }, missingBuyer]), {
  kind: 'SOURCE_ONLY_NON_AUTHORITATIVE', inspectedDocuments: 2,
}, 'two confirmed missing documents are allowed in a model, not on a network error');
// Fail-closed against active erasure, ambiguous/duplicate responses, or fake
// transaction context. These are not emulator or real contention tests.
for (const invalidRows of [
  [txRow, missingBuyer],
  [missingBuyer, rejectedSeller],
  [missingBuyer, { ...txRow, found: rejectedSeller.found }],
  [missingBuyer, { ...txRow, missing: expectedSeller }],
  [{ ...txRow, readTime: 'invalid' }, missingBuyer, rejectedSeller],
  [txRow, missingBuyer, { missing: expectedSeller, unexpected: true }],
  [txRow, missingBuyer, { missing: expectedSeller, error: { status: 404 } }],
  [txRow, missingBuyer, missingBuyer],
  [txRow, missingBuyer, { missing: expectedSeller + '-evil' }],
  [txRow, missingBuyer, { found: { ...rejectedSeller.found, fields: {} } }],
  [txRow, missingBuyer, { found: { ...rejectedSeller.found, fields: { status: { stringValue: 'pending' } } } }],
  [txRow, missingBuyer, { found: { ...rejectedSeller.found, fields: { status: { stringValue: 'processing' } } } }],
  [txRow, missingBuyer, { found: { ...rejectedSeller.found, fields: { status: { stringValue: 'completed' } } } }],
  [txRow, missingBuyer, { found: { ...rejectedSeller.found, updateTime: 'bogus' } }],
  [txRow, missingBuyer, { found: rejectedSeller.found, missing: expectedSeller }],
  [txRow, missingBuyer, { error: { status: 404 } }],
  [{ transaction: 'bad!!!' }, missingBuyer, rejectedSeller],
  [txRow, { ...txRow, missing: expectedBuyer }, rejectedSeller],
]) assert.throws(() => assess(invalidRows), /ERASURE_(ADMISSION|ATOMIC)_/,
  'a malformed or active Firestore result must never become an admission grant');
for (const changed of [
  { projectId: 'production' },
  { participants: [] },
  { participants: [admission.participants[0], admission.participants[0]] },
  { participants: ['../admin'] },
]) {
  assert.throws(() => buildSyntheticErasureAdmissionBatchGetRequest({
    projectId: admission.projectId, participants: admission.participants, ...changed,
  }), /ERASURE_ADMISSION_/);
}
assert(!writer.includes('buildSyntheticErasureAdmissionBatchGetRequest')
  && !reconciler.includes('buildSyntheticErasureAdmissionBatchGetRequest')
  && !writer.includes('inspectSyntheticErasureAdmissionBatchGet')
  && !reconciler.includes('inspectSyntheticErasureAdmissionBatchGet'),
  'transactional read model is intentionally NOT integrated into trusted writers');
// P01 regression: trusted commerce mutators must fail closed before acquiring
// credentials until a server-side buyer+seller admission transaction exists.
// Source-only: no Firebase calls, credentials, network, or destructive smoke.
const reconcileFreeze = "if (apply) throw new Error('RESERVATION_COMMERCE_ADMISSION_FREEZE_NOT_VERIFIED');";
const outcomeFreeze = "if (apply && tasks.has('outcomes')) throw new Error('TRUSTED_OUTCOMES_ADMISSION_FREEZE_NOT_VERIFIED');";
assert(reconciler.includes(reconcileFreeze), 'reservation reconciliation must reject apply');
assert(writer.includes(outcomeFreeze), 'trusted commerce outcomes must reject apply');
assert(reconciler.indexOf(reconcileFreeze) > reconciler.indexOf('assertStagingTarget();')
  && reconciler.indexOf(reconcileFreeze) < reconciler.indexOf('const token = await accessToken();'),
  'reservation apply must stop before Firebase token retrieval');
assert(writer.indexOf(outcomeFreeze) < writer.indexOf('const token = await firebaseCiAccessToken();'),
  'trusted commerce apply must stop before Firebase token retrieval');
assert(!reconciler.includes('RESERVATION_ADMISSION_ALLOW_APPLY')
  && !writer.includes('TRUSTED_OUTCOMES_ADMISSION_ALLOW_APPLY'),
  'no environment override may silently bypass admission freeze');
const guardedMaintenanceWrapper = fs.readFileSync('scripts/v2-trusted-maintenance-guarded.mjs', 'utf8');
const wrapperOutcomeFreeze = "if (sharedArgs.includes('--apply') && task === 'outcomes')";
assert(guardedMaintenanceWrapper.includes(wrapperOutcomeFreeze), 'wrapper must skip commerce outcomes in apply mode');
assert(guardedMaintenanceWrapper.indexOf(wrapperOutcomeFreeze) < guardedMaintenanceWrapper.indexOf("run('scripts/trusted-reputation-capacity-guard.mjs'"),
  'wrapper must block outcomes BEFORE privileged capacity/credential reads');
assert(guardedMaintenanceWrapper.includes("blocked.push(task)") && guardedMaintenanceWrapper.includes('continue;'),
  'wrapper must skip outcomes independently without blocking other task lanes');
console.log('PASS trusted maintenance wrapper blocks commerce before capacity credentials; unrelated tasks remain independent (source only)');
console.log('PASS privileged commerce apply freezes precede credential access (source only)');
// Synthetic CLI preflight of the actual privileged runner: no module imports,
// tokens, provider calls or mutable credentials are evaluated by this VM.
const trustedPrelude = writer.slice(writer.indexOf('const projectId ='),
  writer.indexOf('const token = await firebaseCiAccessToken();'));
assert(trustedPrelude.includes('TRUSTED_MAINTENANCE_ERASURE_ADMISSION_FREEZE_NOT_VERIFIED'));
assert(!trustedPrelude.includes('await firebaseCiAccessToken'));
function simulateTrustedTask(task, apply = true) {
  return () => vm.runInNewContext(trustedPrelude, {
    process: {
      env: { TUTOP_FIREBASE_PROJECT_ID: 'tutop-beta-vicmdlb-1356585881',
        TUTOP_ALLOW_V2_MAINTENANCE: 'staging-v2' },
      argv: ['node', 'scripts/v2-trusted-maintenance.mjs',
        ...(apply ? ['--apply'] : []), '--tasks=' + task],
    },
  }, { timeout: 250 });
}
for (const task of ['reputation', 'saved-searches', 'push']) {
  assert.throws(simulateTrustedTask(task), /TRUSTED_MAINTENANCE_ERASURE_ADMISSION_FREEZE_NOT_VERIFIED/,
    'unproven maintenance apply must stop before credentials: ' + task);
  assert.doesNotThrow(simulateTrustedTask(task, false),
    'safe dry-run path must remain available for ' + task);
}
assert.doesNotThrow(simulateTrustedTask('credentials'),
  'independent expired-credential cleanup may reach its existing staging guard');
const wrapperFreeze = "['reputation', 'saved-searches', 'push'].includes(task)";
assert(guardedMaintenanceWrapper.includes(wrapperFreeze));
assert(guardedMaintenanceWrapper.indexOf(wrapperFreeze) <
  guardedMaintenanceWrapper.indexOf("run('scripts/trusted-reputation-capacity-guard.mjs'"),
  'guarded wrapper must skip unsafe lanes before capacity/token reads');
console.log('PASS erasure-aware reputation/alert/push maintenance apply denied before credential acquisition; independent dry-run/credentials preserved');

console.log('PASS REST v1 batchGet read-write transaction shape and negative response matrix (synthetic; NO IO/no apply)');
