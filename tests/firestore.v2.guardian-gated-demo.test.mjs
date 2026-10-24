import { verifiedContext } from './verified-context.mjs';
import fs from 'node:fs';
import test, { after, beforeEach } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, deleteDoc, setDoc, updateDoc, Timestamp, writeBatch } from 'firebase/firestore';

// DEMO PROJECT ONLY: this is a migration/security probe, not deployed policy.
// Exact current app rule generation is transformed into separate proof-gated
// rules. This never replaces firebase/firestore.v2.generated.rules.
if (process.env.GCLOUD_PROJECT !== 'demo-tutop-post120-rules') {
  throw new Error('GUARDIAN_DEMO_PROJECT_ONLY');
}
const ruleset = process.env.TUTOP_GUARDIAN_TEST_RULESET || 'guardian-demo';
if (!['guardian-demo', 'baseline'].includes(ruleset)) {
  throw new Error('INVALID_GUARDIAN_TEST_RULESET');
}
const rulesPath = ruleset === 'baseline'
  ? 'firebase/firestore.v2.generated.rules'
  : 'firebase/firestore.v2.guardian-demo.rules';
const rules = fs.readFileSync(rulesPath, 'utf8');
const host = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const [hostname, portRaw] = host.split(':');
const env = await initializeTestEnvironment({
  projectId: process.env.GCLOUD_PROJECT,
  firestore: { host: hostname, port: Number(portRaw || 8080), rules },
});
after(async () => env.cleanup());
beforeEach(async () => env.clearFirestore());
const now = () => Timestamp.now();
const future = () => Timestamp.fromMillis(Date.now() + 60 * 60_000);
const past = () => Timestamp.fromMillis(Date.now() - 60_000);
const age = (uid, band, extras = {}) => ({
  subjectUid: uid, band, issuer: 'trusted_server', revoked: false, expires_at: future(), ...extras,
});
const grant = (caps, extras = {}) => ({
  childUid: 'buyer', guardianUid: 'parent', issuer: 'trusted_server',
  active: true, consentVersion: 'v1', approvedCapabilities: caps, expires_at: future(), ...extras,
});

async function seed(buyerAge = null, sellerAge = 'adult', buyerGrant = null) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users/buyer'), { uid: 'buyer', institution_id: 'uatx', campus_id: 'uatx-riberena', nombre: 'Buyer' });
    await setDoc(doc(db, 'users/seller'), { uid: 'seller', institution_id: 'uatx', campus_id: 'uatx-riberena', nombre: 'Seller' });
    await setDoc(doc(db, 'products/listing'), { vendedor_id: 'seller', estado: 'Activo' });
    // The actual generated chat/offer rules use canonical listings_v2,
    // not just the historical products collection.
    await setDoc(doc(db, 'listings_v2/listing'), {
      schema_version: 2, seller_id: 'seller', status: 'active',
      moderation_status: 'approved',
    });
    if (buyerAge) await setDoc(doc(db, 'age_proofs_v2/buyer'), age('buyer', buyerAge));
    if (sellerAge) await setDoc(doc(db, 'age_proofs_v2/seller'), age('seller', sellerAge));
    if (buyerGrant) await setDoc(doc(db, 'guardian_grants_v2/buyer'), buyerGrant);
  });
}
const chat = () => ({
  product_id: 'listing', producto_id: 'listing', buyer_id: 'buyer', comprador_id: 'buyer',
  seller_id: 'seller', vendedor_id: 'seller', participants: ['buyer', 'seller'],
  nombre_otro_usuario: 'Seller', last_message: '', created_at: now(),
  updated_at: now(), last_message_at: now(),
});
function countedWrite(db, action, write) {
  const batch = writeBatch(db);
  write(batch);
  batch.set(doc(db, 'rate_limits/buyer-' + action), {
    uid: 'buyer', action, window_start: now(), count: 1, updated_at: now(),
  });
  return batch.commit();
}
const createChat = (db) => countedWrite(db, 'chat_create', batch => {
  batch.set(doc(db, 'chats/chat-buyer-listing'), chat());
});
const createOffer = (db) => countedWrite(db, 'offer_create', batch => {
  batch.set(doc(db, 'offers/offer-buyer'), {
    listing_id: 'listing', chat_id: 'chat-buyer-listing', buyer_id: 'buyer',
    seller_id: 'seller', created_by: 'buyer', amount_mxn: 300, status: 'pending',
    expires_at: future(), created_at: now(), updated_at: now(),
  });
});
const createMessage = (db) => countedWrite(db, 'message_create', batch => {
  batch.set(doc(db, 'chats/chat-buyer-listing/messages/m1'), {
    sender_id: 'buyer', text: 'Hola', created_at: now(),
  });
});
async function seedChat() {
  await env.withSecurityRulesDisabled(async (ctx) =>
    setDoc(doc(ctx.firestore(), 'chats/chat-buyer-listing'), chat()));
}

test('isolated age proof gate accepts a server-issued adult claim and rejects revoked claim', async () => {
  await seed('adult');
  const buyer = verifiedContext(env, 'buyer').firestore();
  await assertSucceeds(setDoc(doc(buyer, 'guardian_demo_probe/buyer'), { signal: 'adult-ok' }));
  await env.withSecurityRulesDisabled(async (ctx) => {
    await updateDoc(doc(ctx.firestore(), 'age_proofs_v2/buyer'), { revoked: true });
    await deleteDoc(doc(ctx.firestore(), 'guardian_demo_probe/buyer'));
  });
  await assertFails(setDoc(doc(buyer, 'guardian_demo_probe/buyer'), { signal: 'revoked-must-deny' }));
});

test('unknown or missing age proof cannot establish a chat', async () => {
  await seed(null);
  await assertFails(createChat(verifiedContext(env, 'buyer').firestore()));
});

test('adult and teen verified accounts can establish a chat with adult recipient', async () => {
  await seed('teen_13_17');
  await assertSucceeds(createChat(verifiedContext(env, 'buyer').firestore()));
});

test('under-13 child cannot independently open direct chat even with signed guardian grant', async () => {
  await seed('under_13', 'adult', grant(['direct_chat']));
  await assertFails(createChat(verifiedContext(env, 'buyer').firestore()));
});

test('expired proof, revoked proof, or unverified recipient fails closed', async () => {
  await seed('adult');
  await env.withSecurityRulesDisabled(async (ctx) => {
    await updateDoc(doc(ctx.firestore(), 'age_proofs_v2/buyer'), { expires_at: past() });
  });
  await assertFails(createChat(verifiedContext(env, 'buyer').firestore()));
  await env.withSecurityRulesDisabled(async (ctx) => {
    await updateDoc(doc(ctx.firestore(), 'age_proofs_v2/buyer'), { expires_at: future() });
    await updateDoc(doc(ctx.firestore(), 'age_proofs_v2/seller'), { revoked: true });
  });
  await assertFails(createChat(verifiedContext(env, 'buyer').firestore()));
});

test('under-13 cannot send messages or make offers inside historical chats', async () => {
  await seed('under_13', 'adult', grant(['publish_listing']));
  await seedChat();
  const buyer = verifiedContext(env, 'buyer').firestore();
  await assertFails(createMessage(buyer));
  await assertFails(createOffer(buyer));
});

test('verified adult with active adult recipient can create a message', async () => {
  await seed('adult');
  await seedChat();
  try {
    await assertSucceeds(createMessage(verifiedContext(env, 'buyer').firestore()));
  } catch (error) {
    // Synthetic demo project only. Inspect the official local emulator
    // expression report to differentiate access-call exhaustion vs failed
    // predicates. Never log real account records or auth tokens.
    const url = `http://${hostname}:${Number(portRaw || 8080)}/emulator/v1/projects/${process.env.GCLOUD_PROJECT}:ruleCoverage`;
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
      const report = await response.text();
      console.error('GUARDIAN_DEMO_RULE_COVERAGE_STATUS', response.status);
      console.error('GUARDIAN_DEMO_RULE_COVERAGE_TAIL', report.slice(-9500));
    } catch (coverageError) {
      console.error('GUARDIAN_DEMO_COVERAGE_UNAVAILABLE', String(coverageError));
    }
    throw error;
  }
});
