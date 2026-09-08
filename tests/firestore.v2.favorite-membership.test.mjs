import fs from 'node:fs';
import test, { after, beforeEach } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { collection, getDocs, query, setDoc, doc, where, Timestamp } from 'firebase/firestore';

const projectId = process.env.GCLOUD_PROJECT || 'demo-tutop-v2-rules';
const host = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const [hostname, portRaw] = host.split(':');
const rules = fs.readFileSync('firebase/firestore.v2.generated.rules', 'utf8');
const env = await initializeTestEnvironment({ projectId, firestore: { host: hostname, port: Number(portRaw || 8080), rules } });

after(async () => env.cleanup());
beforeEach(async () => env.clearFirestore());

async function seedFavorites() {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const createdAt = Timestamp.now();
    await setDoc(doc(db, 'favorites/alice_listing-1'), { uid: 'alice', product_id: 'listing-1', created_at: createdAt });
    await setDoc(doc(db, 'favorites/alice_listing-2'), { uid: 'alice', product_id: 'listing-2', created_at: createdAt });
    await setDoc(doc(db, 'favorites/alice_listing-4'), { uid: 'alice', product_id: 'listing-4', created_at: createdAt });
    await setDoc(doc(db, 'favorites/bob_listing-2'), { uid: 'bob', product_id: 'listing-2', created_at: createdAt });
    await setDoc(doc(db, 'favorites/bob_listing-3'), { uid: 'bob', product_id: 'listing-3', created_at: createdAt });
  });
}

function membershipQuery(db, uid, productIds) {
  return query(
    collection(db, 'favorites'),
    where('uid', '==', uid),
    where('product_id', 'in', productIds),
  );
}

test('membership IN devuelve exactamente los favoritos propios solicitados', async () => {
  await seedFavorites();
  const alice = env.authenticatedContext('alice').firestore();
  const snapshot = await assertSucceeds(getDocs(membershipQuery(alice, 'alice', ['listing-1', 'listing-2', 'listing-3'])));
  const ids = snapshot.docs.map((item) => item.data().product_id).sort();
  if (JSON.stringify(ids) !== JSON.stringify(['listing-1', 'listing-2'])) {
    throw new Error(`FAVORITE_MEMBERSHIP_MISMATCH:${JSON.stringify(ids)}`);
  }
});

test('membership IN respeta subsets y no arrastra favoritos fuera del lote visible', async () => {
  await seedFavorites();
  const alice = env.authenticatedContext('alice').firestore();
  const snapshot = await assertSucceeds(getDocs(membershipQuery(alice, 'alice', ['listing-4', 'listing-5'])));
  const ids = snapshot.docs.map((item) => item.data().product_id);
  if (ids.length !== 1 || ids[0] !== 'listing-4') throw new Error(`FAVORITE_SUBSET_LEAK:${JSON.stringify(ids)}`);
});

test('otro usuario no puede consultar membership de alice aunque conozca sus product IDs', async () => {
  await seedFavorites();
  const bob = env.authenticatedContext('bob').firestore();
  await assertFails(getDocs(membershipQuery(bob, 'alice', ['listing-1', 'listing-2'])));
});

test('consulta sin filtro uid no puede demostrar ownership y falla cerrada', async () => {
  await seedFavorites();
  const alice = env.authenticatedContext('alice').firestore();
  const unsafe = query(collection(alice, 'favorites'), where('product_id', 'in', ['listing-1', 'listing-2']));
  await assertFails(getDocs(unsafe));
});

test('crear favorito acepta un listing canónico V2 aunque no exista espejo legacy', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'listings_v2/v2-only'), {
      seller_id: 'seller', status: 'active', moderation_status: 'approved', created_at: Timestamp.now(), updated_at: Timestamp.now(),
    });
  });
  const alice = env.authenticatedContext('alice').firestore();
  await assertSucceeds(setDoc(doc(alice, 'favorites/alice_v2-only'), {
    uid: 'alice', product_id: 'v2-only', created_at: Timestamp.now(),
  }));
});

test('crear favorito sigue rechazando IDs inexistentes o documentId no determinista', async () => {
  const alice = env.authenticatedContext('alice').firestore();
  await assertFails(setDoc(doc(alice, 'favorites/alice_missing'), {
    uid: 'alice', product_id: 'missing', created_at: Timestamp.now(),
  }));

  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'listings_v2/v2-only'), { seller_id: 'seller' });
  });
  await assertFails(setDoc(doc(alice, 'favorites/not-deterministic'), {
    uid: 'alice', product_id: 'v2-only', created_at: Timestamp.now(),
  }));
});
