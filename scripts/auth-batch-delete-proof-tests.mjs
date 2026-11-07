import assert from 'node:assert/strict';
import fs from 'node:fs';
import { assertAuthBatchDeleteResponse, assertAuthAccountAbsent } from './auth-batch-delete-proof.mjs';
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
const localId='synthetic-uid';
assert.equal(assertAuthAccountAbsent({},localId),true,'no users key means no matching account');
assert.equal(assertAuthAccountAbsent({users:[]},localId),true);
for (const r of [
 null, undefined, 'ok', [], {users:null}, {users:{}},
 {error:{message:'PERMISSION_DENIED'}}, {errors:[]},
 {users:[{localId}]}, {users:[{localId:'unrelated-user'}]}, {users:[{}]}
]) assert.throws(()=>assertAuthAccountAbsent(r,localId),/AUTH_LOOKUP_/);
for (const unsafeUid of ['uid/unsafe', '', ' x ', 'short']) {
  assert.throws(()=>assertAuthAccountAbsent({},unsafeUid),/AUTH_LOOKUP_UID_INVALID/);
}
const source=fs.readFileSync('scripts/staging-v2-admin.mjs','utf8');
const processor=fs.readFileSync('scripts/process-account-erasure.mjs','utf8');
assert.match(source,/assertAuthBatchDeleteResponse\(result\)/);
assert.match(source,/localIds, force: true/);
assert.match(source,/accounts:lookup/);
assert.match(source,/body: JSON.stringify\(\{ localId: \[uid\] \}\)/);
assert.match(source,/assertAuthAccountAbsent\(result, uid\)/);
const auth=processor.indexOf('await adminDeleteTestUsers([uid])');
const finalCommit=processor.indexOf('await adminCommitAccountErasureCompletion(');
const readback=processor.indexOf('await adminAssertAuthUserAbsent(uid)');
assert(auth>=0 && readback>auth && finalCommit>readback,'delete then Auth absence readback then atomic completion');
console.log('PASS batchDelete partial errors and post-delete Auth UID readback fail closed (synthetic, no network)');
