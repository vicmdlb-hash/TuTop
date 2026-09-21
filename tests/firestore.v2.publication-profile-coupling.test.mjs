import fs from 'node:fs';
import test, { after, beforeEach } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, Timestamp, writeBatch } from 'firebase/firestore';

const projectId = process.env.GCLOUD_PROJECT || 'demo-tutop-publication-profile-coupling';
const host = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const [hostname, portRaw] = host.split(':');
const rules = fs.readFileSync('firebase/firestore.v2.generated.rules', 'utf8');
const env = await initializeTestEnvironment({ projectId, firestore: { host: hostname, port: Number(portRaw || 8080), rules } });

after(async () => env.cleanup());
beforeEach(async () => env.clearFirestore());

const now = () => Timestamp.now();
const photo = 'data:image/webp;base64,UklGRg==';

function auth(uid='seller') {
  return env.authenticatedContext(uid, { email: uid+'@example.com', email_verified: true }).firestore();
}

async function seedCatalogAndStaleProfile() {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'institutions/uatx'), { name: 'UATx', active: true });
    await setDoc(doc(db, 'campuses/riberena'), { institution_id: 'uatx', name: 'Ribereña', active: true });
    await setDoc(doc(db, 'institutions/old-university'), { name: 'Old University', active: true });
    await setDoc(doc(db, 'campuses/old-campus'), { institution_id: 'old-university', name: 'Old Campus', active: true });
    await setDoc(doc(db, 'users/seller'), {
      uid: 'seller', nombre: 'Seller', facultad: 'Turismo', esta_verificado: false,
      institution_id: 'old-university', campus_id: 'old-campus', created_at: now(), updated_at: now(),
    });
  });
}

function listing(campus='riberena') {
  const at=now();
  return {
    schema_version:2, seller_id:'seller', institution_id:'uatx', campus_id:campus,
    category_id:'electronics', title:'Audífonos', description:'Prueba publicación',
    attributes:{}, price_mxn:500, negotiable:true, quantity:1, condition:'good',
    delivery_methods:['campus_meetup'], meeting_point_ids:[], shipping_available:false,
    photo_urls:[photo], status:'active', moderation_status:'pending', visibility_scope:'campus',
    published_at:at, created_at:at, updated_at:at,
  };
}

function publicationBatch(db,id,data) {
  const at=now(); const batch=writeBatch(db);
  batch.set(doc(db,'rate_limits/seller-listing_create'), {uid:'seller',action:'listing_create',window_start:at,count:1,updated_at:at});
  batch.set(doc(db,'listings_v2/'+id), data);
  return batch;
}

test('verified seller can publish to a valid selected institution/campus even when users profile is stale', async () => {
  await seedCatalogAndStaleProfile();
  const db=auth();
  await assertSucceeds(publicationBatch(db,'valid-selected-campus',listing()).commit());
});

test('invalid/nonexistent campus still fails closed', async () => {
  await seedCatalogAndStaleProfile();
  const db=auth();
  await assertFails(publicationBatch(db,'invalid-campus',listing('missing-campus')).commit());
});

test('campus belonging to another institution still fails closed', async () => {
  await seedCatalogAndStaleProfile();
  const db=auth();
  await assertFails(publicationBatch(db,'wrong-parent-campus',listing('old-campus')).commit());
});

console.log('PASS publication no longer depends on stale users profile; canonical institution/campus integrity remains enforced');
