import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildAccountErasureFinalCommit, buildSyntheticErasureAdmissionVerifyWrites } from './account-erasure-atomic-commit.mjs';
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
// Admission witnesses are a source-only prototype, not wired to any trusted writer.
const admission = {
  projectId: 'tutop-beta-vicmdlb-1356585881',
  participants: ['buyer-test-01', 'seller-test-01'],
  requestSnapshots: [
    { uid: 'buyer-test-01', document: null },
    { uid: 'seller-test-01', document: { status: 'rejected', updateTime: '2026-10-22T21:59:00.123456789Z' } },
  ],
};
const verifies = buildSyntheticErasureAdmissionVerifyWrites(admission);
assert.equal(verifies.length, 2);
assert.equal(verifies[0].verify,
  'projects/tutop-beta-vicmdlb-1356585881/databases/(default)/documents/account_deletion_requests/buyer-test-01');
assert.deepEqual(verifies[0].currentDocument, { exists: false });
assert.deepEqual(verifies[1].currentDocument, { updateTime: '2026-10-22T21:59:00.123456789Z' });
assert(verifies.every(w => !('update' in w) && !('delete' in w)),
  'an admission witness must not change deletion requests or commerce data');
// Pure model of Firestore precondition semantics, NOT an emulator or live assertion.
const syntheticCurrentDocumentMatches = (w, liveDoc) =>
  'exists' in w.currentDocument ? liveDoc === null :
    liveDoc?.updateTime === w.currentDocument.updateTime;
assert(syntheticCurrentDocumentMatches(verifies[0], null));
assert(!syntheticCurrentDocumentMatches(verifies[0], { status: 'pending', updateTime: '2026-10-22T22:00:00Z' }),
  'a deletion request inserted before the same commit invalidates exists:false');
assert(syntheticCurrentDocumentMatches(verifies[1], admission.requestSnapshots[1].document));
assert(!syntheticCurrentDocumentMatches(verifies[1], { status: 'pending', updateTime: '2026-10-22T22:00:00Z' }),
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
]) assert.throws(() => buildSyntheticErasureAdmissionVerifyWrites({ ...admission, ...altered }), /ERASURE_(ADMISSION|ATOMIC)_/,
  'malformed or active deletion must never create an allowing witness');
const writer = fs.readFileSync('scripts/v2-trusted-maintenance.mjs', 'utf8');
const reconciler = fs.readFileSync('scripts/reconcile-v2-reservations.mjs', 'utf8');
assert(!writer.includes('buildSyntheticErasureAdmissionVerifyWrites')
  && !reconciler.includes('buildSyntheticErasureAdmissionVerifyWrites'),
  'prototype must not be wired into trusted remote writers before integrated safety review');
console.log('PASS source-only Admin REST atomic admission witness prototype and synthetic deletion-race preconditions; NO apply');

console.log('PASS conditional account-erasure completion + audit are one atomic REST batch; synthetic/no Firebase');
