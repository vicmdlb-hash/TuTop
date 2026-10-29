import assert from 'node:assert/strict';
import fs from 'node:fs';
import { planFcmOutboxClaim, attachCommittedFcmClaim, planFcmOutboxCompletion } from './fcm-outbox-attempt-lib.mjs';

const oldTime = '2026-10-28T20:00:00.000Z';
const startTime = '2026-10-28T20:00:01.000Z';
const newTime = '2026-10-28T20:00:02.000Z';
const sentTime = '2026-10-28T20:00:03.000Z';
const pending = { id:'synthetic-notice',status:'pending',attempts:0,_document_update_time:oldTime };
const planned = planFcmOutboxClaim(pending,startTime);
assert.deepEqual(planned.precondition,{updateTime:oldTime});
assert.deepEqual(planned.fields,{status:'dispatching',attempts:1,dispatch_started_at:startTime,updated_at:startTime});
const claimed = attachCommittedFcmClaim(pending,planned,{writeResults:[{updateTime:newTime}]});
assert.equal(claimed.status,'dispatching');
assert.equal(claimed._document_update_time,newTime);
assert.equal([claimed].filter(x=>x.status==='pending').length,0,'ambiguous delivery cannot auto-requeue');
assert.throws(()=>planFcmOutboxClaim(claimed,sentTime),/FCM_OUTBOX_NOT_PENDING/);
const sent = planFcmOutboxCompletion(claimed,sentTime);
assert.deepEqual(sent.precondition,{updateTime:newTime});
assert.equal(sent.fields.status,'sent');
assert(!Object.hasOwn(sent.fields,'attempts'),'do not double count the claim attempt');
for(const bad of [{...pending,status:'sent'},{...pending,status:'dispatching'},
 {...pending,attempts:-1},{...pending,attempts:'bad'},
 {...pending,_document_update_time:'bad'}])
  assert.throws(()=>planFcmOutboxClaim(bad,startTime));
for(const bad of [null,{}, {writeResults:[]},{writeResults:[{}]},
 {writeResults:[{updateTime:'bad'}]},
 {writeResults:[{updateTime:newTime},{updateTime:newTime}]}])
  assert.throws(()=>attachCommittedFcmClaim(pending,planned,bad));
assert.throws(()=>planFcmOutboxCompletion(pending,sentTime),/FCM_OUTBOX_NOT_DISPATCHING/);
assert.throws(()=>planFcmOutboxCompletion(claimed,'bad'),/FCM_OUTBOX_SENT_TIME_INVALID/);
const source=fs.readFileSync('scripts/post116-fcm-owner-safe-sender.mjs','utf8');
const claimIndex=source.indexOf('const claimed = await claimPending(item);');
const sendIndex=source.indexOf('messages:send');
assert(claimIndex>0 && sendIndex>claimIndex,'Firestore claim must precede HTTP FCM send');
assert(source.includes("const pending = outbox.filter((item) => item.status === 'pending');"));
assert(source.includes("if (deliveredForItem > 0) await markSent(claimed);"));
assert(source.includes('currentDocument: planned.precondition'));
console.log('PASS synthetic FCM outbox CAS claim-before-send and uncertain-delivery quarantine');
