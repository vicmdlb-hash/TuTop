import assert from 'node:assert/strict';
import fs from 'node:fs';
import { directUserPair, shouldSuppressBlockedDirectNotification } from './user-block-notification-lib.mjs';

const chat = { id:'chat-17',buyer_id:'buyer',seller_id:'seller' };
const offer = { kind:'offer_received',chat_id:'chat-17',recipient_uid:'seller' };
const message = { kind:'new_message',chat_id:'chat-17',recipient_uid:'buyer' };
const blocks = new Set();
const edge = async (a,b) => blocks.has(a+'>'+b);
assert.equal(await shouldSuppressBlockedDirectNotification(offer,chat,edge),false);
blocks.add('seller>buyer');
assert.equal(await shouldSuppressBlockedDirectNotification(offer,chat,edge),true);
assert.equal(await shouldSuppressBlockedDirectNotification(message,chat,edge),true);
blocks.clear();
blocks.add('buyer>seller');
assert.equal(await shouldSuppressBlockedDirectNotification(offer,chat,edge),true);
assert.equal(await shouldSuppressBlockedDirectNotification(message,chat,edge),true);
assert.equal(await shouldSuppressBlockedDirectNotification(offer,null,edge),true);
assert.equal(await shouldSuppressBlockedDirectNotification({...offer, recipient_uid:'stranger'},chat,edge),true);
assert.equal(await shouldSuppressBlockedDirectNotification({...offer,chat_id:'another'},chat,edge),true);
assert.equal(await shouldSuppressBlockedDirectNotification({kind:'transaction_completed',recipient_uid:'seller'},chat,edge),false);
assert.deepEqual(directUserPair({kind:'new_message',chat_id:'chat-17',recipient_uid:'seller'},chat),{buyer:'buyer',seller:'seller'});
const projector=fs.readFileSync('scripts/v2-marketplace-notification-projector.mjs','utf8');
const sender=fs.readFileSync('scripts/post116-fcm-owner-safe-sender.mjs','utf8');
for(const source of [projector,sender]){
 assert.match(source,/shouldSuppressBlockedDirectNotification/);
 assert.match(source,/user_blocks/);
 assert.match(source,/suppressed_by_user_blocks/);
}
assert.match(projector,/if \(await shouldSuppressBlockedDirectNotification/);
assert.match(sender,/if \(await blockedDirectOutbox\(item\)\)/);
assert.match(sender,/if \(!\['new_message','offer_received','counter_offer','offer_accepted'\]/);
console.log('PASS bidirectional direct-message/offer block suppression in projector and FCM sender; transactional notifications remain independent');
