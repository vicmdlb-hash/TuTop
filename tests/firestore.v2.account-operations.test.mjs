import { verifiedContext } from './verified-context.mjs';
import fs from 'node:fs';
import test, { after, beforeEach } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, Timestamp, writeBatch } from 'firebase/firestore';

const projectId = process.env.GCLOUD_PROJECT || 'demo-tutop-v2-rules';
const host = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const [hostname, portRaw] = host.split(':');
const rules = fs.readFileSync('firebase/firestore.v2.generated.rules', 'utf8');
const env = await initializeTestEnvironment({ projectId, firestore: { host: hostname, port: Number(portRaw || 8080), rules } });

const now = () => Timestamp.now();

after(async () => env.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'admins/support'), { active: true, role: 'support' });
    await setDoc(doc(db, 'admins/moderator'), { active: true, role: 'moderator' });
  });
});

test('owner crea solicitud pending y terceros no pueden leerla ni modificarla', async () => {
  const owner = verifiedContext(env, 'alice').firestore();
  const stranger = verifiedContext(env, 'bob').firestore();
  const ref = doc(owner, 'account_deletion_requests/alice');
  await assertSucceeds(setDoc(ref, { uid: 'alice', status: 'pending', requested_at: now(), updated_at: now() }));
  await assertSucceeds(getDoc(ref));
  await assertFails(getDoc(doc(stranger, 'account_deletion_requests/alice')));
  await assertFails(updateDoc(ref, { status: 'processing', updated_at: now() }));
});

test('owner puede re-solicitar tras rechazo sin alterar identidad ni completar desde cliente', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'account_deletion_requests/alice'), {
      uid: 'alice', status: 'rejected', requested_at: now(), updated_at: now(),
    });
  });
  const owner = verifiedContext(env, 'alice').firestore();
  const stranger = verifiedContext(env, 'bob').firestore();
  const path = 'account_deletion_requests/alice';
  const ref = doc(owner, path);
  const reRequest = { status: 'pending', requested_at: now(), updated_at: now() };
  await assertFails(updateDoc(doc(stranger, path), reRequest));
  await assertFails(updateDoc(ref, { status: 'processing', requested_at: now(), updated_at: now() }));
  await assertFails(updateDoc(ref, { status: 'completed', requested_at: now(), updated_at: now() }));
  await assertFails(updateDoc(ref, { uid: 'bob', ...reRequest }));
  await assertSucceeds(updateDoc(ref, reRequest));
  const after = await getDoc(ref);
  if (after.data()?.status !== 'pending') throw new Error('OWNER_RE_REQUEST_STATUS_INVALID');
  await assertFails(updateDoc(ref, reRequest));
});

test('support puede iniciar procesamiento pero no declarar completed desde cliente', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'account_deletion_requests/alice'), { uid: 'alice', status: 'pending', requested_at: now(), updated_at: now() });
  });
  const support = verifiedContext(env, 'support').firestore();
  const ref = doc(support, 'account_deletion_requests/alice');
  await assertSucceeds(getDoc(ref));
  await assertSucceeds(updateDoc(ref, { status: 'processing', updated_at: now() }));
  await assertFails(updateDoc(ref, { status: 'pending', updated_at: now() }));
  await assertFails(updateDoc(ref, { status: 'completed', updated_at: now() }));
  await assertSucceeds(updateDoc(ref, { status: 'rejected', updated_at: now() }));
  await assertFails(updateDoc(ref, { status: 'processing', updated_at: now() }));
});

test('support puede rechazar pending pero no alterar identidad ni fecha original', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'account_deletion_requests/alice'), { uid: 'alice', status: 'pending', requested_at: now(), updated_at: now() });
  });
  const support = verifiedContext(env, 'support').firestore();
  const ref = doc(support, 'account_deletion_requests/alice');
  await assertFails(updateDoc(ref, { uid: 'mallory', status: 'processing', updated_at: now() }));
  await assertFails(updateDoc(ref, { requested_at: now(), status: 'processing', updated_at: now() }));
  await assertSucceeds(updateDoc(ref, { status: 'rejected', updated_at: now() }));
});

test('support audita sólo operaciones de eliminación de cuenta', async () => {
  const support = verifiedContext(env, 'support').firestore();
  await assertSucceeds(setDoc(doc(support, 'audit_log/delete-alice'), {
    admin_uid: 'support', actor_type: 'admin', role: 'support', action: 'account_deletion_processing',
    target_type: 'account_deletion_request', target_id: 'alice', created_at: now(),
  }));
  await assertSucceeds(getDoc(doc(support, 'audit_log/delete-alice')));
  await assertFails(setDoc(doc(support, 'audit_log/moderate-product'), {
    admin_uid: 'support', actor_type: 'admin', role: 'support', action: 'listing_approved',
    target_type: 'listing', target_id: 'listing-1', created_at: now(),
  }));
});

test('moderator general no hereda permisos de privacidad de soporte', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'account_deletion_requests/alice'), { uid: 'alice', status: 'pending', requested_at: now(), updated_at: now() });
  });
  const moderator = verifiedContext(env, 'moderator').firestore();
  await assertFails(getDoc(doc(moderator, 'account_deletion_requests/alice')));
  await assertFails(updateDoc(doc(moderator, 'account_deletion_requests/alice'), { status: 'processing', updated_at: now() }));
});

async function seedOfferAdmissionFixture() {
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    for (const uid of ['buyer','seller']) {
      await setDoc(doc(db, 'users/' + uid), {
        uid, institution_id: 'uatx', campus_id: 'u', nombre: uid,
      });
    }
    await setDoc(doc(db, 'listings_v2/item'), {
      schema_version: 2, seller_id: 'seller', status: 'active', moderation_status: 'approved',
    });
    await setDoc(doc(db, 'chats/room'), {
      product_id: 'item', producto_id: 'item', buyer_id: 'buyer', comprador_id: 'buyer',
      seller_id: 'seller', vendedor_id: 'seller', participants: ['buyer','seller'],
      nombre_otro_usuario: 'seller', last_message: '',
      last_message_at: now(), created_at: now(), updated_at: now(),
    });
  });
}
async function setSyntheticDeletion(uid, status) {
  await env.withSecurityRulesDisabled(async ctx => {
    await setDoc(doc(ctx.firestore(), 'account_deletion_requests/' + uid), {
      uid, status, requested_at: now(), updated_at: now(),
    });
  });
}
function submitInitialOffer() {
  const db=verifiedContext(env,'buyer').firestore();
  const batch=writeBatch(db);
  batch.set(doc(db,'offers/fixture-initial'),{
    listing_id:'item',chat_id:'room',buyer_id:'buyer',seller_id:'seller',
    created_by:'buyer',amount_mxn:120,status:'pending',
    expires_at:Timestamp.fromMillis(Date.now()+3600000),
    created_at:now(),updated_at:now(),
  });
  batch.set(doc(db,'rate_limits/buyer-offer_create'), {
    uid:'buyer',action:'offer_create',window_start:now(),count:1,updated_at:now(),
  });
  return batch.commit();
}

test('P01 generated Rules accept an eligible offer without erasure (positive)',async()=>{
  await seedOfferAdmissionFixture();
  await assertSucceeds(submitInitialOffer());
});
test('P01 generated Rules refuse offers while buyer deletion is pending',async()=>{
  await seedOfferAdmissionFixture();await setSyntheticDeletion('buyer','pending');
  await assertFails(submitInitialOffer());
});
test('P01 generated Rules refuse offers while seller deletion is processing',async()=>{
  await seedOfferAdmissionFixture();await setSyntheticDeletion('seller','processing');
  await assertFails(submitInitialOffer());
});
test('P01 generated Rules accept rejected seller deletion only',async()=>{
  await seedOfferAdmissionFixture();await setSyntheticDeletion('seller','rejected');
  await assertSucceeds(submitInitialOffer());
});
test('P01 generated Rules fail closed on unknown seller erasure state',async()=>{
  await seedOfferAdmissionFixture();await setSyntheticDeletion('seller','unknown');
  await assertFails(submitInitialOffer());
});

