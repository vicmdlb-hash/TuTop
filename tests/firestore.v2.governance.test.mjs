import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import test, { after, beforeEach } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, Timestamp } from 'firebase/firestore';

const prepared = spawnSync(process.execPath, ['scripts/prepare-firestore-v2-rules.mjs'], { stdio: 'inherit' });
if (prepared.status !== 0) process.exit(prepared.status || 1);

const projectId = process.env.GCLOUD_PROJECT || 'demo-tutop-v2-rules';
const host = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const [hostname, portRaw] = host.split(':');
const rules = fs.readFileSync('firebase/firestore.v2.generated.rules', 'utf8');
const env = await initializeTestEnvironment({ projectId, firestore: { host: hostname, port: Number(portRaw || 8080), rules } });

after(async () => env.cleanup());
beforeEach(async () => env.clearFirestore());

const now = () => Timestamp.now();

async function seedBase() {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'admins/global'), { active: true, role: 'trust_safety' });
    await setDoc(doc(db, 'admins/uatxmod'), { active: true, role: 'institution_moderator', institution_id: 'uatx' });
    await setDoc(doc(db, 'admins/buapmod'), { active: true, role: 'institution_moderator', institution_id: 'buap' });
    await setDoc(doc(db, 'admins/support'), { active: true, role: 'support' });
    await setDoc(doc(db, 'admins/verify'), { active: true, role: 'verification_reviewer' });
    await setDoc(doc(db, 'admins/legacy'), { active: true });
    await setDoc(doc(db, 'users/uatx-user'), { uid: 'uatx-user', institution_id: 'uatx', nombre: 'UATx', facultad: 'FCEA' });
    await setDoc(doc(db, 'users/buap-user'), { uid: 'buap-user', institution_id: 'buap', nombre: 'BUAP', facultad: 'Admin' });
    await setDoc(doc(db, 'reports/r-uatx'), { created_by: 'reporter', target_type: 'product', target_id: 'p1', reason: 'spam', status: 'open', institution_id: 'uatx', priority: 'normal', created_at: now(), updated_at: now() });
    await setDoc(doc(db, 'reports/r-buap'), { created_by: 'reporter', target_type: 'product', target_id: 'p2', reason: 'spam', status: 'open', institution_id: 'buap', priority: 'normal', created_at: now(), updated_at: now() });
    await setDoc(doc(db, 'reports/r-global'), { created_by: 'reporter', target_type: 'user', target_id: 'u3', reason: 'abuse', status: 'open', priority: 'urgent', created_at: now(), updated_at: now() });
  });
}

function preferences() {
  return {
    new_message: true,
    offer_received: true,
    offer_accepted: true,
    counter_offer: true,
    reservation_expiring: true,
    meetup_reminder: true,
    saved_search_match: true,
    favorite_price_drop: true,
    saved_item_available: true,
    followed_seller_new_listing: false,
    listing_saved_count: false,
    weekly_digest: false,
    safety_alert: true,
    updated_at: now(),
  };
}

test('moderador institucional sólo puede leer y resolver reportes de su institución', async () => {
  await seedBase();
  const uatx = env.authenticatedContext('uatxmod').firestore();
  await assertSucceeds(getDoc(doc(uatx, 'reports/r-uatx')));
  await assertFails(getDoc(doc(uatx, 'reports/r-buap')));
  await assertFails(getDoc(doc(uatx, 'reports/r-global')));
  await assertSucceeds(updateDoc(doc(uatx, 'reports/r-uatx'), { status: 'reviewing', updated_at: now() }));
  await assertFails(updateDoc(doc(uatx, 'reports/r-buap'), { status: 'reviewing', updated_at: now() }));
});

test('trust safety y admin legacy conservan alcance global', async () => {
  await seedBase();
  const global = env.authenticatedContext('global').firestore();
  const legacy = env.authenticatedContext('legacy').firestore();
  await assertSucceeds(getDoc(doc(global, 'reports/r-uatx')));
  await assertSucceeds(getDoc(doc(global, 'reports/r-global')));
  await assertSucceeds(getDoc(doc(legacy, 'reports/r-buap')));
});

test('moderador institucional sólo puede suspender usuarios de su institución', async () => {
  await seedBase();
  const uatx = env.authenticatedContext('uatxmod').firestore();
  await assertSucceeds(setDoc(doc(uatx, 'moderationStatus/uatx-user'), { suspended: true, reason: 'case', updated_at: now(), admin_uid: 'uatxmod' }));
  await assertFails(setDoc(doc(uatx, 'moderationStatus/buap-user'), { suspended: true, reason: 'case', updated_at: now(), admin_uid: 'uatxmod' }));
});

test('preferencias de notificación son privadas del propietario', async () => {
  const owner = env.authenticatedContext('alice').firestore();
  const stranger = env.authenticatedContext('bob').firestore();
  await assertSucceeds(setDoc(doc(owner, 'notification_preferences/alice'), preferences()));
  await assertSucceeds(getDoc(doc(owner, 'notification_preferences/alice')));
  await assertFails(getDoc(doc(stranger, 'notification_preferences/alice')));
  await assertFails(setDoc(doc(stranger, 'notification_preferences/alice'), preferences()));
});

test('solicitud de eliminación la crea el usuario y soporte puede procesarla', async () => {
  await seedBase();
  const owner = env.authenticatedContext('alice').firestore();
  const support = env.authenticatedContext('support').firestore();
  const stranger = env.authenticatedContext('bob').firestore();
  await assertSucceeds(setDoc(doc(owner, 'account_deletion_requests/alice'), { uid: 'alice', status: 'pending', requested_at: now(), updated_at: now() }));
  await assertFails(getDoc(doc(stranger, 'account_deletion_requests/alice')));
  await assertSucceeds(getDoc(doc(support, 'account_deletion_requests/alice')));
  await assertSucceeds(updateDoc(doc(support, 'account_deletion_requests/alice'), { status: 'processing', updated_at: now() }));
});

test('reviewer de verificación no obtiene permisos generales de moderación', async () => {
  await seedBase();
  const verify = env.authenticatedContext('verify').firestore();
  await assertFails(getDoc(doc(verify, 'reports/r-uatx')));
});
