import fs from 'node:fs';
import test, { after, beforeEach } from 'node:test';
import { verifiedContext } from './verified-context.mjs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, deleteDoc, updateDoc, Timestamp, writeBatch } from 'firebase/firestore';

const projectId = process.env.GCLOUD_PROJECT || 'demo-tutop-v2-rules';
const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':');
const rules = fs.readFileSync('firebase/firestore.v2.generated.rules', 'utf8');
const env = await initializeTestEnvironment({ projectId, firestore: { host, port: Number(port || 8080), rules } });
after(async () => env.cleanup());
beforeEach(async () => env.clearFirestore());

async function seedConversation() {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'chats/chat-1'), {
      product_id: 'listing-1', buyer_id: 'alice', seller_id: 'bob',
      participants: ['alice', 'bob'], created_at: Timestamp.now(),
      updated_at: Timestamp.now(), last_message: '', last_message_at: Timestamp.now(),
    });
  });
}
const blockData = (owner, target) => ({ blocker_uid: owner, blocked_uid: target, created_at: Timestamp.now() });
const rateData = (uid, count, window) => ({
  uid, action: 'message_create', window_start: window, count, updated_at: Timestamp.now(),
});
function messageCommit(db, uid, index, window, id) {
  const batch = writeBatch(db);
  batch.set(doc(db, `chats/chat-1/messages/${id}`), {
    sender_id: uid, text: 'Prueba autorizada del emulador', created_at: Timestamp.now(),
  });
  batch.set(doc(db, `rate_limits/${uid}-message_create`), rateData(uid, index, window));
  return batch.commit();
}

test('owner controls private block; other account cannot read or impersonate; self-block denied', async () => {
  const alice = verifiedContext(env, 'alice').firestore();
  const bob = verifiedContext(env, 'bob').firestore();
  await assertSucceeds(setDoc(doc(alice, 'user_blocks/alice/targets/bob'), blockData('alice', 'bob')));
  await assertSucceeds(getDoc(doc(alice, 'user_blocks/alice/targets/bob')));
  await assertFails(getDoc(doc(bob, 'user_blocks/alice/targets/bob')));
  await assertFails(setDoc(doc(bob, 'user_blocks/alice/targets/charlie'), blockData('alice', 'charlie')));
  await assertFails(setDoc(doc(alice, 'user_blocks/alice/targets/alice'), blockData('alice', 'alice')));
  await assertFails(setDoc(doc(alice, 'user_blocks/alice/targets/charlie'), blockData('bob', 'charlie')));
  await assertFails(updateDoc(doc(alice, 'user_blocks/alice/targets/bob'), {blocked_uid:'charlie'}));
  await assertFails(deleteDoc(doc(bob, 'user_blocks/alice/targets/bob')));
  await assertSucceeds(deleteDoc(doc(alice, 'user_blocks/alice/targets/bob')));
  const missing = await assertSucceeds(getDoc(doc(alice, 'user_blocks/alice/targets/bob')));
  if (missing.exists()) throw new Error('BLOCK_NOT_DELETED');
});

test('blocked counterpart cannot write new chat messages in either direction; old history stays readable; unblock restores', async () => {
  await seedConversation();
  const alice = verifiedContext(env, 'alice').firestore();
  const bob = verifiedContext(env, 'bob').firestore();
  const window = Timestamp.now();
  await assertSucceeds(messageCommit(alice, 'alice', 1, window, 'before-block'));
  await assertSucceeds(setDoc(doc(alice, 'user_blocks/alice/targets/bob'), blockData('alice','bob')));
  await assertSucceeds(getDoc(doc(alice, 'chats/chat-1/messages/before-block')));
  await assertSucceeds(getDoc(doc(bob, 'chats/chat-1/messages/before-block')));
  await assertFails(messageCommit(alice, 'alice', 2, window, 'blocked-alice'));
  await assertFails(messageCommit(bob, 'bob', 1, window, 'blocked-bob'));
  await assertFails(updateDoc(doc(alice, 'chats/chat-1'), {last_message:'not allowed',last_message_at:Timestamp.now(),updated_at:Timestamp.now()}));
  await assertSucceeds(deleteDoc(doc(alice, 'user_blocks/alice/targets/bob')));
  await assertSucceeds(messageCommit(alice, 'alice', 2, window, 'after-unblock'));
});

test('reverse block also denies buyer-originating new messages', async () => {
  await seedConversation();
  const bob = verifiedContext(env, 'bob').firestore();
  const alice = verifiedContext(env, 'alice').firestore();
  await assertSucceeds(setDoc(doc(bob,'user_blocks/bob/targets/alice'),blockData('bob','alice')));
  await assertFails(messageCommit(alice,'alice',1,Timestamp.now(),'reverse-block'));
});
