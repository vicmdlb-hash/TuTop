import fs from 'node:fs';
import assert from 'node:assert/strict';
import test, { after, beforeEach } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, Timestamp, writeBatch } from 'firebase/firestore';
import { verifiedContext } from './verified-context.mjs';

// DEMO ONLY. This does not authorize Admin SDK writers or destructive --apply.
if (process.env.GCLOUD_PROJECT !== 'demo-tutop-post120-rules')
  throw new Error('ERASURE_FREEZE_TEST_DEMO_ONLY');
const host = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const [hostname, portRaw] = host.split(':');
const env = await initializeTestEnvironment({
  projectId: 'demo-tutop-post120-rules',
  firestore: {
    host: hostname, port: Number(portRaw || 8080),
    rules: fs.readFileSync('firebase/firestore.v2.erasure-freeze-demo.rules', 'utf8'),
  },
});
after(async () => env.cleanup());
beforeEach(async () => env.clearFirestore());
const now = () => Timestamp.now(), future = () => Timestamp.fromMillis(Date.now() + 3600000);

async function seed() {
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users/buyer'), { uid: 'buyer', institution_id: 'uatx', campus_id: 'u', nombre: 'Buyer' });
    await setDoc(doc(db, 'users/seller'), { uid: 'seller', institution_id: 'uatx', campus_id: 'u', nombre: 'Seller' });
    await setDoc(doc(db, 'products/listing'), { vendedor_id: 'seller', estado: 'Activo' });
    await setDoc(doc(db, 'listings_v2/listing'), { schema_version: 2, seller_id: 'seller', status: 'active', moderation_status: 'approved' });
  });
}
function chat() {
  return { product_id: 'listing', producto_id: 'listing', buyer_id: 'buyer', comprador_id: 'buyer',
    seller_id: 'seller', vendedor_id: 'seller', participants: ['buyer', 'seller'],
    nombre_otro_usuario: 'Seller', last_message: '', last_message_at: now(),
    created_at: now(), updated_at: now() };
}
async function preseedChat() {
  await env.withSecurityRulesDisabled(async ctx =>
    setDoc(doc(ctx.firestore(), 'chats/chat-buyer-listing'), chat()));
}
function countedWrite(db, action, operation) {
  const batch = writeBatch(db);
  operation(batch);
  batch.set(doc(db, 'rate_limits/buyer-' + action),
    { uid: 'buyer', action, window_start: now(), count: 1, updated_at: now() });
  return batch.commit();
}
const asBuyer = () => verifiedContext(env, 'buyer').firestore();
const createChat = db => countedWrite(db, 'chat_create', b => b.set(doc(db,'chats/chat-buyer-listing'), chat()));
const createOffer = db => countedWrite(db, 'offer_create', b => b.set(doc(db,'offers/offer-1'), {
  listing_id: 'listing', chat_id: 'chat-buyer-listing', buyer_id: 'buyer', seller_id: 'seller',
  created_by: 'buyer', amount_mxn: 300, status: 'pending', expires_at: future(),
  created_at: now(), updated_at: now(),
}));
const createMessage = db => countedWrite(db, 'message_create', b => b.set(doc(db,'chats/chat-buyer-listing/messages/m1'), {
  sender_id: 'buyer', text: 'Prueba sin datos reales', created_at: now(),
}));
async function deletion(uid, status = 'pending') {
  await env.withSecurityRulesDisabled(async ctx =>
    setDoc(doc(ctx.firestore(), 'account_deletion_requests/' + uid),
      { uid, status, requested_at: now(), updated_at: now() }));
}

test('no active erasure permits normal buyer chat creation (regression)', async () => {
  await seed();
  await assertSucceeds(createChat(asBuyer()));
});
test('baseline active buyer and seller permit an offer to an existing chat (positive control)', async () => {
  await seed(); await preseedChat();
  await assertSucceeds(createOffer(asBuyer()));
});
test('baseline active buyer and seller permit a message to an existing chat (positive control)', async () => {
  await seed(); await preseedChat();
  await assertSucceeds(createMessage(asBuyer()));
});
test('pending buyer forbids a new chat, even if authenticated and verified', async () => {
  await seed(); await deletion('buyer');
  await assertFails(createChat(asBuyer()));
});
test('pending seller forbids a buyer-originated chat (counterparty freeze)', async () => {
  await seed(); await deletion('seller');
  await assertFails(createChat(asBuyer()));
});
test('rejected request may resume normal chat', async () => {
  await seed(); await deletion('seller', 'rejected');
  await assertSucceeds(createChat(asBuyer()));
});
test('unknown deletion status fails closed instead of allowing new commerce', async () => {
  await seed(); await deletion('seller', 'unexpected');
  await assertFails(createChat(asBuyer()));
});
test('processing buyer blocks a new chat just like pending buyer', async () => {
  await seed(); await deletion('buyer', 'processing');
  await assertFails(createChat(asBuyer()));
});
test('pending seller cannot admit an offer to historical chat', async () => {
  await seed(); await preseedChat();
  await deletion('seller');
  await assertFails(createOffer(asBuyer()));
});
test('pending buyer cannot admit an offer to historical chat either', async () => {
  await seed(); await preseedChat();
  await deletion('buyer');
  await assertFails(createOffer(asBuyer()));
});
test('pending counterparty denies new messages but preserves historical chat read', async () => {
  await seed(); await preseedChat(); await deletion('seller', 'processing');
  const db = asBuyer();
  await assertFails(createMessage(db));
  await assertSucceeds(getDoc(doc(db,'chats/chat-buyer-listing')));
});
test('owner can create own deletion request, then commerce admission closes', async () => {
  await seed(); const db = asBuyer();
  await assertSucceeds(setDoc(doc(db,'account_deletion_requests/buyer'),
    { uid:'buyer', status:'pending', requested_at:now(), updated_at:now() }));
  await assertFails(createChat(db));
});


test('demo-only Firestore REST batchGet starts a read-write transaction and preserves missing/rejected identities', async () => {
  // STRICT DEMO-LOCAL HOST GATE: no credentials, staging, production, or remote IO.
  if (process.env.GCLOUD_PROJECT !== 'demo-tutop-post120-rules'
    || !/^(127\.0\.0\.1|localhost):8080$/.test(host)) {
    throw Error('ERASURE_REST_DEMO_LOCAL_EMULATOR_ONLY');
  }
  await deletion('seller', 'rejected');
  const root = 'projects/demo-tutop-post120-rules/databases/(default)/documents';
  const prefix = `http://${host}/v1/${root}`;
  const buyer = `${root}/account_deletion_requests/buyer`;
  const seller = `${root}/account_deletion_requests/seller`;
  // Literal 'owner' is the Firestore emulator's documented LOCAL admin bypass.
  // It is NOT an OAuth credential and only goes to the allowlisted loopback host.
  const emulatorHeaders = { 'Content-Type': 'application/json', Authorization: 'Bearer owner' };
  const response = await fetch(`${prefix}:batchGet`, {
    method: 'POST', headers: emulatorHeaders,
    body: JSON.stringify({
      documents: [buyer, seller], newTransaction: { readWrite: {} },
    }),
  });
  assert.equal(response.status, 200, 'emulator REST must accept read-write batchGet');
  const body = (await response.text()).trim();
  assert(body && body.length < 64 * 1024, 'bounded emulator response required');
  // REST emulator may pretty-print each streaming JSON object across many
  // lines. Parse complete top-level objects, never assume one JSON per line.
  const parseStream = (raw) => {
    try {
      const entire = JSON.parse(raw);
      return Array.isArray(entire) ? entire : [entire];
    } catch { /* may be multiple top-level JSON objects */ }
    const parsed = [];
    let depth = 0, quote = false, escaped = false, start = -1, lastEnd = 0;
    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i];
      if (quote) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') quote = false;
        continue;
      }
      if (ch === '"') { quote = true; continue; }
      if (ch === '{') {
        if (depth === 0) {
          if (raw.slice(lastEnd, i).trim()) throw Error('ERASURE_REST_STREAM_SEPARATOR_INVALID');
          start = i;
        }
        depth++;
      } else if (ch === '}') {
        if (depth <= 0) throw Error('ERASURE_REST_STREAM_BRACES_INVALID');
        depth--;
        if (depth === 0) {
          parsed.push(JSON.parse(raw.slice(start, i + 1)));
          lastEnd = i + 1;
          start = -1;
        }
      }
    }
    if (depth !== 0 || quote || raw.slice(lastEnd).trim() || !parsed.length) {
      throw Error('ERASURE_REST_STREAM_INCOMPLETE');
    }
    return parsed;
  };
  const rows = parseStream(body);
  assert(rows.length >= 2 && rows.length <= 3, 'each participant must yield one result');
  assert.equal(typeof rows[0].transaction, 'string');
  assert(rows[0].transaction.length > 0);
  assert(rows.slice(1).every(row => !Object.hasOwn(row, 'transaction')),
    'new transaction ID must only appear in the first response');
  const docs = rows.filter(row => row.found || row.missing);
  assert.equal(docs.length, 2, 'buyer and seller both explicitly returned');
  assert(docs.some(row => row.missing === buyer), 'missing buyer must not be inferred from transport 404');
  assert(docs.some(row => row.found?.name === seller
    && row.found.fields?.status?.stringValue === 'rejected'),
    'server-origin rejected status must appear for seller');
  // Release any read locks. Never output or persist a raw transaction ID.
  const rollback = await fetch(`${prefix}:rollback`, {
    method: 'POST', headers: emulatorHeaders,
    body: JSON.stringify({ transaction: rows[0].transaction }),
  });
  assert.equal(rollback.status, 200, 'demo-only transaction should be rolled back');
  // No documents:commit, no privileged writer, no destructive erasure here.
});
