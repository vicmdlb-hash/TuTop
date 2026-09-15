import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { getFirestore, Timestamp, writeBatch, doc, getDoc } from 'firebase/firestore';
import { buildV2InitialAccountDocuments } from '../src/lib/v2InitialAccount.ts';
import { adminDeleteDocument, adminDeleteTestUsers } from './staging-v2-admin.mjs';

const projectId = String(process.env.TUTOP_FIREBASE_PROJECT_ID || '').trim();
const configPath = String(process.env.TUTOP_STAGING_WEB_CONFIG_PATH || '.tutop-staging-web-config.json').trim();
const REQUIRED = 'tutop-beta-vicmdlb-1356585881';
if (projectId !== REQUIRED) throw new Error(`Registration smoke fijado a ${REQUIRED}.`);
if (!fs.existsSync(configPath)) throw new Error(`Falta ${configPath}.`);
const firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
if (firebaseConfig.projectId !== projectId) throw new Error('Config Firebase no corresponde al staging objetivo.');

function phoneAliasEmail(phone) {
  const digest = crypto.createHash('sha256').update(phone).digest('hex');
  return `phone-${digest.slice(0, 48)}@auth.tutop.app`;
}

const suffix = String(Date.now()).slice(-7);
const phone = `+52246${suffix}`;
const run = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const password = `Reg-${run}-TuTop!A9`;
const listingId = `registration-smoke-listing-${run}`;
const docsToClean = [];
let uid = '';
let app;

const identity = {
  country_code: 'MX',
  state_code: 'TLAX',
  state_name: 'Tlaxcala',
  city_id: 'TLAX-tlaxcala',
  city_name: 'Tlaxcala',
  institution_id: 'uatx',
  institution_name: 'Universidad Autónoma de Tlaxcala',
  campus_id: 'uatx-riberena',
  campus_name: 'Campus Ribereña',
  faculty_id: 'uatx-fcea',
  faculty_name: 'Ciencias Económico Administrativas',
  career_id: 'uatx-turismo',
  career_name: 'Turismo Internacional',
};

function consumeListingRate(batch, db, ownerUid) {
  const id = `${ownerUid}-listing_create`;
  batch.set(doc(db, 'rate_limits', id), {
    uid: ownerUid,
    action: 'listing_create',
    window_start: Timestamp.now(),
    count: 1,
    updated_at: Timestamp.now(),
  });
  docsToClean.push(`rate_limits/${id}`);
}

try {
  app = initializeApp(firebaseConfig, `tutop-registration-smoke-${run}`);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const credential = await createUserWithEmailAndPassword(auth, phoneAliasEmail(phone), password);
  uid = credential.user.uid;

  const now = Timestamp.now();
  const initial = buildV2InitialAccountDocuments({
    uid,
    phone,
    nombre: 'Registro Real Smoke',
    legacyFacultad: 'Ciencias Económico Administrativas',
    identity,
    now,
  });

  const batch = writeBatch(db);
  batch.set(doc(db, 'users', uid), initial.profile);
  batch.set(doc(db, 'user_private', uid), initial.privateProfile);
  batch.set(doc(db, 'wallets', uid), initial.wallet);
  batch.set(doc(db, 'wallet_transactions', initial.walletTransaction.id), initial.walletTransaction.data);
  await batch.commit();
  docsToClean.push(
    `wallet_transactions/${initial.walletTransaction.id}`,
    `wallets/${uid}`,
    `user_private/${uid}`,
    `users/${uid}`,
  );

  const profile = await getDoc(doc(db, 'users', uid));
  assert.equal(profile.data()?.institution_id, 'uatx', 'registro app-like quedó sin institution_id');
  assert.equal(profile.data()?.campus_id, 'uatx-riberena', 'registro app-like quedó sin campus_id');
  assert.equal(profile.data()?.faculty_id, 'uatx-fcea', 'registro app-like quedó sin faculty_id');
  assert.equal(profile.data()?.career_id, 'uatx-turismo', 'registro app-like quedó sin career_id');

  const created = Timestamp.now();
  const listing = writeBatch(db);
  listing.set(doc(db, 'listings_v2', listingId), {
    schema_version: 2,
    seller_id: uid,
    institution_id: 'uatx',
    campus_id: 'uatx-riberena',
    city_id: identity.city_id,
    faculty_id: 'uatx-fcea',
    career_id: 'uatx-turismo',
    category_id: 'videojuegos',
    title: 'PlayStation 5 registro smoke',
    description: 'Publicación temporal creada inmediatamente después del registro real.',
    attributes: { brand: 'Sony', model: 'PlayStation 5' },
    price_mxn: 5000,
    negotiable: false,
    quantity: 1,
    condition: 'Buen estado',
    delivery_methods: ['campus_meetup'],
    meeting_point_ids: ['uatx-riberena-cafeteria'],
    shipping_available: false,
    photo_urls: ['data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"></svg>'],
    status: 'active',
    moderation_status: 'pending',
    visibility_scope: 'campus',
    published_at: created,
    created_at: created,
    updated_at: created,
  });
  consumeListingRate(listing, db, uid);
  await listing.commit();
  docsToClean.push(`listings_v2/${listingId}`);

  const storedListing = await getDoc(doc(db, 'listings_v2', listingId));
  assert.equal(storedListing.exists(), true, 'cuenta recién registrada no pudo publicar');
  assert.equal(storedListing.data()?.seller_id, uid);
  assert.equal(storedListing.data()?.institution_id, 'uatx');
  assert.equal(storedListing.data()?.campus_id, 'uatx-riberena');
  console.log('✅ Registro app-like atómico + publicación inmediata por Security Rules PASS.');
  await signOut(auth);
} finally {
  for (const path of [...docsToClean].reverse()) await adminDeleteDocument(path).catch(() => undefined);
  if (uid) await adminDeleteTestUsers([uid]).catch(() => undefined);
  if (app) await deleteApp(app).catch(() => undefined);
}
