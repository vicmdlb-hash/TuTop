import assert from 'node:assert/strict';
import fs from 'node:fs';
import { assertAuthBatchDeleteResponse } from './auth-batch-delete-proof.mjs';
assert.equal(assertAuthBatchDeleteResponse({}),true);
assert.equal(assertAuthBatchDeleteResponse({errors:[]}),true);
for (const r of [
  null, undefined, [], 'success', false, {errors:null}, {errors:'not-an-array'},
  {errors:[{index:0,localId:'synthetic-uid',message:'USER_NOT_FOUND'}]},
  {errors:[{index:0,localId:'synthetic-uid',message:'PERMISSION_DENIED'}]},
  {errors:[{}]},
]) {
  assert.throws(()=>assertAuthBatchDeleteResponse(r),/AUTH_BATCH_DELETE_/);
}
const source=fs.readFileSync('scripts/staging-v2-admin.mjs','utf8');
const processor=fs.readFileSync('scripts/process-account-erasure.mjs','utf8');
assert.match(source,/assertAuthBatchDeleteResponse\(result\)/);
assert.match(source,/localIds, force: true/);
const auth=processor.indexOf('await adminDeleteTestUsers([uid])');
const finalCommit=processor.indexOf('await adminCommitAccountErasureCompletion(');
assert(auth>=0 && finalCommit>auth,'batchDelete failures must prevent final completion');
console.log('PASS batchDelete per-account errors fail closed; no Auth/Firebase requests');
