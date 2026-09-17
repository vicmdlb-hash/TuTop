import { verifiedContext } from './verified-context.mjs';
import fs from 'node:fs';
import test, { after, beforeEach } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';

// Rules are generated exactly once by the CI step before the emulator starts.
const projectId = process.env.GCLOUD_PROJECT || 'demo-tutop-v2-rules';
const host = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const [hostname, portRaw] = host.split(':');
const rules = fs.readFileSync('firebase/firestore.v2.generated.rules', 'utf8');
const env = await initializeTestEnvironment({ projectId, firestore: { host: hostname, port: Number(portRaw || 8080), rules } });

after(async () => env.cleanup());
beforeEach(async () => env.clearFirestore());

const reputation = {
  subject_uid: 'seller',
  completed_transactions: 3,
  completed_as_seller: 2,
  completed_as_buyer: 1,
  seller_review_count: 2,
  seller_positive_count: 1,
  seller_positive_rate: 50,
  buyer_review_count: 1,
  buyer_positive_count: 1,
  buyer_positive_rate: 100,
  cancellations: 0,
  no_shows: 0,
  reports_upheld: 0,
  updated_at: Timestamp.now(),
};

async function seedAdmin() {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'admins/admin'), { active: true });
  });
}

test('usuario autenticado no puede escribir su propia reputación', async () => {
  const seller = verifiedContext(env, 'seller').firestore();
  await assertFails(setDoc(doc(seller, 'reputation/seller'), reputation));
});

test('tercero tampoco puede fabricar reputación para otra cuenta', async () => {
  const stranger = verifiedContext(env, 'stranger').firestore();
  await assertFails(setDoc(doc(stranger, 'reputation/seller'), reputation));
});

test('admin activo puede persistir un snapshot trusted y usuarios pueden leerlo', async () => {
  await seedAdmin();
  const admin = verifiedContext(env, 'admin').firestore();
  const seller = verifiedContext(env, 'seller').firestore();
  await assertSucceeds(setDoc(doc(admin, 'reputation/seller'), reputation));
  await assertSucceeds(getDoc(doc(seller, 'reputation/seller')));
});

test('admin no puede escribir subject_uid de otra cuenta', async () => {
  await seedAdmin();
  const admin = verifiedContext(env, 'admin').firestore();
  await assertFails(setDoc(doc(admin, 'reputation/seller'), { ...reputation, subject_uid: 'other' }));
});

test('admin no puede escribir campos arbitrarios ni contadores negativos', async () => {
  await seedAdmin();
  const admin = verifiedContext(env, 'admin').firestore();
  await assertFails(setDoc(doc(admin, 'reputation/seller'), { ...reputation, fabricated_score: 999 }));
  await assertFails(setDoc(doc(admin, 'reputation/seller'), { ...reputation, reports_upheld: -1 }));
});

test('admin no puede romper consistencia de transacciones o reviews', async () => {
  await seedAdmin();
  const admin = verifiedContext(env, 'admin').firestore();
  await assertFails(setDoc(doc(admin, 'reputation/seller'), { ...reputation, completed_transactions: 99 }));
  await assertFails(setDoc(doc(admin, 'reputation/seller'), { ...reputation, seller_positive_count: 3 }));
  await assertFails(setDoc(doc(admin, 'reputation/seller'), { ...reputation, seller_positive_rate: 101 }));
});

test('tasas null sólo son válidas sin reviews', async () => {
  await seedAdmin();
  const admin = verifiedContext(env, 'admin').firestore();
  await assertFails(setDoc(doc(admin, 'reputation/seller'), { ...reputation, seller_positive_rate: null }));
  await assertSucceeds(setDoc(doc(admin, 'reputation/empty'), {
    subject_uid: 'empty',
    completed_transactions: 0,
    completed_as_seller: 0,
    completed_as_buyer: 0,
    seller_review_count: 0,
    seller_positive_count: 0,
    seller_positive_rate: null,
    buyer_review_count: 0,
    buyer_positive_count: 0,
    buyer_positive_rate: null,
    cancellations: 0,
    no_shows: 0,
    reports_upheld: 0,
    updated_at: Timestamp.now(),
  }));
});
