import { verifiedContext } from './verified-context.mjs';
import fs from 'node:fs';
import test, { after, beforeEach } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const projectId = process.env.GCLOUD_PROJECT || 'demo-tutop-private-admin-reads';
const host = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const [hostname, portRaw] = host.split(':');
const rules = fs.readFileSync('firebase/firestore.v2.generated.rules', 'utf8');
const env = await initializeTestEnvironment({ projectId, firestore: { host: hostname, port: Number(portRaw || 8080), rules } });

after(async () => env.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'admins/super'), { active: true, role: 'super_admin' });
    await setDoc(doc(db, 'admins/trust'), { active: true, role: 'trust_safety' });
    await setDoc(doc(db, 'admins/mod'), { active: true, role: 'moderator' });
    await setDoc(doc(db, 'admins/inst'), { active: true, role: 'institution_moderator', institution_id: 'uatx' });
    await setDoc(doc(db, 'admins/verify'), { active: true, role: 'verification_reviewer' });
    await setDoc(doc(db, 'admins/support'), { active: true, role: 'support' });

    await setDoc(doc(db, 'user_private/alice'), { uid: 'alice', telefono: '+521234567890', institutional_email: 'alice@example.edu', auth_mode: 'phone_password_beta' });
    await setDoc(doc(db, 'wallets/alice'), { owner_uid: 'alice', balance: 10, prestige: 0 });
    await setDoc(doc(db, 'wallet_transactions/w1'), { user_id: 'alice', amount: 10 });
    await setDoc(doc(db, 'favorites/f1'), { uid: 'alice', product_id: 'listing-1' });
    await setDoc(doc(db, 'saved_searches/s1'), { owner_uid: 'alice', query: 'laptop' });

    await setDoc(doc(db, 'chats/chat-private'), {
      participants: ['alice', 'bob'], buyer_id: 'alice', seller_id: 'bob', product_id: 'listing-1',
    });
    await setDoc(doc(db, 'chats/chat-private/messages/m1'), { sender_id: 'alice', text: 'private' });
    await setDoc(doc(db, 'chats/chat-private/confirmations/alice'), { user_id: 'alice' });
    await setDoc(doc(db, 'chats/chat-private/reads/alice'), { user_id: 'alice' });

    await setDoc(doc(db, 'offers/o1'), { buyer_id: 'alice', seller_id: 'bob', listing_id: 'listing-1', chat_id: 'chat-private' });
    await setDoc(doc(db, 'transactions_v2/t1'), { buyer_id: 'alice', seller_id: 'bob', listing_id: 'listing-1', chat_id: 'chat-private' });
    await setDoc(doc(db, 'reviews/r1'), { evaluador_id: 'alice', evaluado_id: 'bob', chat_id: 'chat-private' });
    await setDoc(doc(db, 'listing_reservation_locks/listing-1'), { buyer_id: 'alice', seller_id: 'bob', transaction_id: 't1' });
  });
});

const sensitiveCommercePaths = [
  'chats/chat-private',
  'chats/chat-private/messages/m1',
  'chats/chat-private/confirmations/alice',
  'chats/chat-private/reads/alice',
  'offers/o1',
  'transactions_v2/t1',
  'reviews/r1',
  'listing_reservation_locks/listing-1',
];

async function expectReads(db, paths, allowed) {
  for (const path of paths) {
    if (allowed) await assertSucceeds(getDoc(doc(db, path)));
    else await assertFails(getDoc(doc(db, path)));
  }
}

test('owner and marketplace participant access remains intact', async () => {
  const alice = verifiedContext(env, 'alice').firestore();
  await assertSucceeds(getDoc(doc(alice, 'user_private/alice')));
  await assertSucceeds(getDoc(doc(alice, 'wallets/alice')));
  await assertSucceeds(getDoc(doc(alice, 'wallet_transactions/w1')));
  await assertSucceeds(getDoc(doc(alice, 'favorites/f1')));
  await assertSucceeds(getDoc(doc(alice, 'saved_searches/s1')));
  await expectReads(alice, sensitiveCommercePaths, true);
});

test('super_admin gets explicit identity/wallet/commerce scope but not user preference collections', async () => {
  const db = verifiedContext(env, 'super').firestore();
  await assertSucceeds(getDoc(doc(db, 'user_private/alice')));
  await assertSucceeds(getDoc(doc(db, 'wallets/alice')));
  await assertSucceeds(getDoc(doc(db, 'wallet_transactions/w1')));
  await expectReads(db, sensitiveCommercePaths, true);
  await assertFails(getDoc(doc(db, 'favorites/f1')));
  await assertFails(getDoc(doc(db, 'saved_searches/s1')));
  await assertSucceeds(getDoc(doc(db, 'admins/support')));
});

test('trust_safety gets identity and commerce evidence, not wallet/preferences/admin inventory', async () => {
  const db = verifiedContext(env, 'trust').firestore();
  await assertSucceeds(getDoc(doc(db, 'user_private/alice')));
  await assertFails(getDoc(doc(db, 'wallets/alice')));
  await assertFails(getDoc(doc(db, 'wallet_transactions/w1')));
  await expectReads(db, sensitiveCommercePaths, true);
  await assertFails(getDoc(doc(db, 'favorites/f1')));
  await assertFails(getDoc(doc(db, 'saved_searches/s1')));
  await assertFails(getDoc(doc(db, 'admins/support')));
  await assertSucceeds(getDoc(doc(db, 'admins/trust')));
});

test('verification_reviewer gets identity-private evidence only', async () => {
  const db = verifiedContext(env, 'verify').firestore();
  await assertSucceeds(getDoc(doc(db, 'user_private/alice')));
  await assertFails(getDoc(doc(db, 'wallets/alice')));
  await assertFails(getDoc(doc(db, 'wallet_transactions/w1')));
  await expectReads(db, sensitiveCommercePaths, false);
  await assertFails(getDoc(doc(db, 'favorites/f1')));
  await assertFails(getDoc(doc(db, 'saved_searches/s1')));
  await assertFails(getDoc(doc(db, 'admins/support')));
});

for (const roleUid of ['mod', 'inst', 'support']) {
  test(`${roleUid} cannot inherit unrelated private marketplace reads`, async () => {
    const db = verifiedContext(env, roleUid).firestore();
    await assertFails(getDoc(doc(db, 'user_private/alice')));
    await assertFails(getDoc(doc(db, 'wallets/alice')));
    await assertFails(getDoc(doc(db, 'wallet_transactions/w1')));
    await expectReads(db, sensitiveCommercePaths, false);
    await assertFails(getDoc(doc(db, 'favorites/f1')));
    await assertFails(getDoc(doc(db, 'saved_searches/s1')));
    await assertFails(getDoc(doc(db, 'admins/super')));
    await assertSucceeds(getDoc(doc(db, `admins/${roleUid}`)));
  });
}

console.log('Private admin least-privilege role matrix: PASS');
