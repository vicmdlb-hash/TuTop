import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildAccountErasureFinalCommit } from './account-erasure-atomic-commit.mjs';
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
  {audit:{...audit,target_id:'other-user'}},
  {audit:{...audit,processor_run_id:'other'}},
  {audit:{...audit,residual_manifest_version:'other'}},
  {audit:{...audit,created_at:new Date('2026-10-22T22:01:00Z')}}
]) assert.throws(()=>buildAccountErasureFinalCommit({...input,...bad}),/ERASURE_ATOMIC_/);
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
console.log('PASS conditional account-erasure completion + audit are one atomic REST batch; synthetic/no Firebase');
