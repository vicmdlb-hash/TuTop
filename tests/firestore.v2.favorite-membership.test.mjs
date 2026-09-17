import { verifiedContext } from './verified-context.mjs';
import fs from 'node:fs';
import test, { after, beforeEach } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { collection, getDoc, getDocs, query, setDoc, doc, where, Timestamp } from 'firebase/firestore';

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
  const alice = verifiedContext(env, 'alice').firestore();
  const snapshot = await assertSucceeds(getDocs(membershipQuery(alice, 'alice', ['listing-1', 'listing-2', 'listing-3'])));
  const ids = snapshot.docs.map((item) => item.data().product_id).sort();
  if (JSON.stringify(ids) !== JSON.stringify(['listing-1', 'listing-2'])) {
    throw new Error(`FAVORITE_MEMBERSHIP_MISMATCH:${JSON.stringify(ids)}`);
  }
});

test('membership exacto determinista permite al dueño leer su favorito para fallback', async () => {
  await seedFavorites();
  const alice = verifiedContext(env, 'alice').firestore();
  const snapshot = await assertSucceeds(getDoc(doc(alice, 'favorites/alice_listing-1')));
  if (!snapshot.exists()) throw new Error('FAVORITE_EXACT_FALLBACK_MISSING');
  const data = snapshot.data();
  if (data.uid !== 'alice' || data.product_id !== 'listing-1') {
    throw new Error(`FAVORITE_EXACT_FALLBACK_MISMATCH:${JSON.stringify(data)}`);
  }
});

test('membership exacto determinista niega a otro usuario el favorito ajeno', async () => {
  await seedFavorites();
  const bob = verifiedContext(env, 'bob').firestore();
  await assertFails(getDoc(doc(bob, 'favorites/alice_listing-1')));
});

test('membership exacto determinista niega lectura sin autenticación', async () => {
  await seedFavorites();
  const anonymous = env.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(anonymous, 'favorites/alice_listing-1')));
});

test('membership IN respeta subsets y no arrastra favoritos fuera del lote visible', async () => {
  await seedFavorites();
  const alice = verifiedContext(env, 'alice').firestore();
  const snapshot = await assertSucceeds(getDocs(membershipQuery(alice, 'alice', ['listing-4', 'listing-5'])));
  const ids = snapshot.docs.map((item) => item.data().product_id);
  if (ids.length !== 1 || ids[0] !== 'listing-4') throw new Error(`FAVORITE_SUBSET_LEAK:${JSON.stringify(ids)}`);
});

test('otro usuario no puede consultar membership de alice aunque conozca sus product IDs', async () => {
  await seedFavorites();
  const bob = verifiedContext(env, 'bob').firestore();
  await assertFails(getDocs(membershipQuery(bob, 'alice', ['listing-1', 'listing-2'])));
});

test('consulta sin filtro uid no puede demostrar ownership y falla cerrada', async () => {
  await seedFavorites();
  const alice = verifiedContext(env, 'alice').firestore();
  const unsafe = query(collection(alice, 'favorites'), where('product_id', 'in', ['listing-1', 'listing-2']));
  await assertFails(getDocs(unsafe));
});

test('crear favorito acepta un listing canónico V2 activo y aprobado aunque no exista espejo legacy', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'listings_v2/v2-only'), {
      seller_id: 'seller', status: 'active', moderation_status: 'approved', created_at: Timestamp.now(), updated_at: Timestamp.now(),
    });
  });
  const alice = verifiedContext(env, 'alice').firestore();
  await assertSucceeds(setDoc(doc(alice, 'favorites/alice_v2-only'), {
    uid: 'alice', product_id: 'v2-only', created_at: Timestamp.now(),
  }));
});

test('crear favorito V2 rechaza target que existe sólo en products legacy', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'products/legacy-only'), {
      vendedor_id: 'seller', estado: 'Activo', titulo: 'Legacy', created_at: Timestamp.now(), updated_at: Timestamp.now(),
    });
  });
  const alice = verifiedContext(env, 'alice').firestore();
  await assertFails(setDoc(doc(alice, 'favorites/alice_legacy-only'), {
    uid: 'alice', product_id: 'legacy-only', created_at: Timestamp.now(),
  }));
});

test('crear favorito sigue rechazando IDs inexistentes, listings no aprobados o documentId no determinista', async () => {
  const alice = verifiedContext(env, 'alice').firestore();
  await assertFails(setDoc(doc(alice, 'favorites/alice_missing'), {
    uid: 'alice', product_id: 'missing', created_at: Timestamp.now(),
  }));

  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'listings_v2/pending'), {
      seller_id: 'seller', status: 'active', moderation_status: 'pending', created_at: Timestamp.now(), updated_at: Timestamp.now(),
    });
    await setDoc(doc(ctx.firestore(), 'listings_v2/v2-only'), {
      seller_id: 'seller', status: 'active', moderation_status: 'approved', created_at: Timestamp.now(), updated_at: Timestamp.now(),
    });
  });
  await assertFails(setDoc(doc(alice, 'favorites/alice_pending'), {
    uid: 'alice', product_id: 'pending', created_at: Timestamp.now(),
  }));
  await assertFails(setDoc(doc(alice, 'favorites/not-deterministic'), {
    uid: 'alice', product_id: 'v2-only', created_at: Timestamp.now(),
  }));
});
