import assert from 'node:assert/strict';
import fs from 'node:fs';
import { directUserPair, shouldSuppressBlockedDirectNotification, resolveDirectNotificationChat } from './user-block-notification-lib.mjs';

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
const recent = new Map([['chat-17',chat]]);
const oldOffer = {kind:'offer_received',chat_id:'chat-older',recipient_uid:'buyer'};
let lookups = 0;
const fetchChat = async id => { lookups++; return id==='chat-older'?{id,buyer_id:'buyer',seller_id:'seller'}:null;};
const loaded = await resolveDirectNotificationChat(oldOffer,recent,fetchChat);
assert.equal(loaded.id,'chat-older');
assert.equal(await shouldSuppressBlockedDirectNotification(oldOffer,loaded,async()=>false),false);
assert.equal((await resolveDirectNotificationChat(oldOffer,recent,fetchChat)).id,'chat-older');
assert.equal(lookups,1,'cached chat identity is reused');
assert.equal(await resolveDirectNotificationChat({...oldOffer,chat_id:'../unsafe'},recent,fetchChat),null);
assert.equal(await resolveDirectNotificationChat({...oldOffer,chat_id:'missing'},recent,fetchChat),null);
assert.equal(await resolveDirectNotificationChat({kind:'transaction_completed',chat_id:'chat-older'},recent,fetchChat),null);
const projector=fs.readFileSync('scripts/v2-marketplace-notification-projector.mjs','utf8');
const sender=fs.readFileSync('scripts/post116-fcm-owner-safe-sender.mjs','utf8');
for(const source of [projector,sender]){
 assert.match(source,/shouldSuppressBlockedDirectNotification/);
 assert.match(source,/user_blocks/);
 assert.match(source,/suppressed_by_user_blocks/);
}
assert.match(projector,/if \(await shouldSuppressBlockedDirectNotification/);
assert.match(projector,/resolveDirectNotificationChat/);
assert.match(projector,/getChatById/);
assert.doesNotMatch(projector,/blockEdgeCache/);
assert.match(sender,/if \(await blockedDirectOutbox\(item\)\)/);
assert.doesNotMatch(sender,/blockEdgeCache/);
assert.match(sender,/await documentOrNull\(`user_blocks/);
assert.match(sender,/if \(!\['new_message','offer_received','counter_offer','offer_accepted'\]/);
// A physical send must not rely on the pre-claim cached chat snapshot.
const claimAt = sender.indexOf('const claimed = await claimPending(item);');
const firstCheck = sender.indexOf('if (await blockedDirectOutbox(item))');
const lastCheck = sender.indexOf('if (await blockedDirectOutbox(item, { freshChat: true }))');
const sendAt = sender.indexOf('messages:send');
assert(firstCheck >= 0 && firstCheck < claimAt);
assert(lastCheck > claimAt && lastCheck < sendAt);
assert(sender.includes('if (freshChat || !blockChatCache.has(chatId))'));
assert(sender.slice(lastCheck,sendAt).includes('FCM_PHYSICAL_FRESH_DIRECT_BLOCKED'));
const priorChat = { ...chat };
const removedChat = null;
const changedMemberChat = { id: chat.id, buyer_id: 'new-buyer', seller_id: 'seller' };
assert.equal(await shouldSuppressBlockedDirectNotification(offer, priorChat, async()=>false),false);
assert.equal(await shouldSuppressBlockedDirectNotification(offer, removedChat, async()=>false),true,
  'a deleted conversation must not authorize a stale notification');
assert.equal(await shouldSuppressBlockedDirectNotification(message, changedMemberChat, async()=>false),true,
  'a changed chat participant must not receive an old message notification');
blocks.clear();
assert.equal(await shouldSuppressBlockedDirectNotification(message,priorChat,async(a,b)=>a==='buyer'&&b==='seller'),true,
  'a block added after the first check must suppress the final send');
console.log('PASS bidirectional blocks plus fresh post-claim direct recipient/chat validation; no live sends');
