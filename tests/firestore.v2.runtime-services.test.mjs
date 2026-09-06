import fs from 'node:fs';
import test, { after, beforeEach } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc, Timestamp, updateDoc, writeBatch } from 'firebase/firestore';

const projectId = process.env.GCLOUD_PROJECT || 'demo-tutop-v2-rules';
const host = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const [hostname, portRaw] = host.split(':');
const rules = fs.readFileSync('firebase/firestore.v2.generated.rules', 'utf8');
const env = await initializeTestEnvironment({ projectId, firestore: { host: hostname, port: Number(portRaw || 8080), rules } });

after(async () => env.cleanup());
beforeEach(async () => env.clearFirestore());

const now = () => Timestamp.now();

function ratePayload(uid, action, count, windowStart) {
  return { uid, action, window_start: windowStart, count, updated_at: now() };
}

function rateBatch(db, uid, action, count, windowStart, writeAction) {
  const batch = writeBatch(db);
  writeAction(batch);
  batch.set(doc(db, `rate_limits/${uid}-${action}`), ratePayload(uid, action, count, windowStart));
  return batch.commit();
}

async function seedCanonicalTransaction(id, status = 'reserved', meetupAt = undefined) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'listings_v2/listing-1'), {
      seller_id: 'bob', institution_id: 'uatx', campus_id: 'uatx-riberena', status: 'active', moderation_status: 'approved',
    });
    await setDoc(doc(db, `transactions_v2/${id}`), {
      listing_id: 'listing-1', chat_id: 'chat-1', buyer_id: 'alice', seller_id: 'bob', accepted_offer_id: 'offer-1', agreed_amount_mxn: 475,
      status,
      reservation_expires_at: Timestamp.fromMillis(Date.now() + 60 * 60_000),
      ...(meetupAt ? { meetup_at: meetupAt, meeting_point_id: 'uatx-riberena-cafeteria' } : {}),
      created_at: now(), updated_at: now(),
    });
  });
}

test('device token sólo lo controla su propietario', async () => {
  const alice = env.authenticatedContext('alice').firestore();
  const bob = env.authenticatedContext('bob').firestore();
  const payload = {
    owner_uid: 'alice', token: 'fcm-token-value-that-is-long-enough-123456789', platform: 'android', app_version: '0.8.5-beta', active: true, created_at: now(), updated_at: now(),
  };
  await assertSucceeds(setDoc(doc(alice, 'device_tokens/alice-android-1'), payload));
  await assertSucceeds(getDoc(doc(alice, 'device_tokens/alice-android-1')));
  await assertFails(getDoc(doc(bob, 'device_tokens/alice-android-1')));
  await assertFails(updateDoc(doc(bob, 'device_tokens/alice-android-1'), { active: false, updated_at: now() }));
  await assertSucceeds(updateDoc(doc(alice, 'device_tokens/alice-android-1'), { active: false, updated_at: now() }));
  await assertSucceeds(deleteDoc(doc(alice, 'device_tokens/alice-android-1')));
});

test('notification outbox es legible sólo por destinatario y server-only para escritura', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'notification_outbox/n1'), {
      recipient_uid: 'alice', kind: 'saved_search_match', title: 'Encontramos algo', body: 'Calculadora', status: 'pending', created_at: now(), updated_at: now(),
    });
  });
  const alice = env.authenticatedContext('alice').firestore();
  const bob = env.authenticatedContext('bob').firestore();
  await assertSucceeds(getDoc(doc(alice, 'notification_outbox/n1')));
  await assertFails(getDoc(doc(bob, 'notification_outbox/n1')));
  await assertFails(updateDoc(doc(alice, 'notification_outbox/n1'), { status: 'sent' }));
  await assertFails(setDoc(doc(alice, 'notification_outbox/fake'), { recipient_uid: 'alice', status: 'pending' }));
});

test('acción protegida exige bucket atómico y reportes se limitan a 10 por hora', async () => {
  const alice = env.authenticatedContext('alice').firestore();
  const windowStart = now();
  const report = (index) => ({
    created_by: 'alice', target_type: 'user', target_id: 'bob', reason: `Reporte válido ${index}`, status: 'open', priority: 'normal', created_at: now(), updated_at: now(),
  });

  await assertFails(setDoc(doc(alice, 'reports/no-bucket'), report(0)));

  for (let index = 1; index <= 10; index += 1) {
    await assertSucceeds(rateBatch(alice, 'alice', 'report_create', index, windowStart, (batch) => {
      batch.set(doc(alice, `reports/r-${index}`), report(index));
    }));
  }

  await assertFails(rateBatch(alice, 'alice', 'report_create', 11, windowStart, (batch) => {
    batch.set(doc(alice, 'reports/r-11'), report(11));
  }));
  const bucket = await getDoc(doc(alice, 'rate_limits/alice-report_create'));
  if (bucket.data()?.count !== 10) throw new Error(`RATE_LIMIT_COUNTER_CORRUPTED:${bucket.data()?.count}`);
});

test('bucket horario no puede reducirse ni reiniciarse antes de una hora', async () => {
  const alice = env.authenticatedContext('alice').firestore();
  const windowStart = now();
  await assertSucceeds(setDoc(doc(alice, 'rate_limits/alice-message_create'), ratePayload('alice', 'message_create', 1, windowStart)));
  await assertSucceeds(setDoc(doc(alice, 'rate_limits/alice-message_create'), ratePayload('alice', 'message_create', 2, windowStart)));
  await assertFails(setDoc(doc(alice, 'rate_limits/alice-message_create'), ratePayload('alice', 'message_create', 1, windowStart)));
});

test('cancelación unilateral atribuye responsabilidad al actor real', async () => {
  await seedCanonicalTransaction('tx-cancel');
  const alice = env.authenticatedContext('alice').firestore();
  await assertFails(updateDoc(doc(alice, 'transactions_v2/tx-cancel'), {
    status: 'cancelled', outcome_code: 'seller_cancelled', outcome_actor_id: 'bob', outcome_recorded_at: now(), updated_at: now(),
  }));
  await assertSucceeds(updateDoc(doc(alice, 'transactions_v2/tx-cancel'), {
    status: 'cancelled', outcome_code: 'buyer_cancelled', outcome_actor_id: 'alice', outcome_recorded_at: now(), updated_at: now(),
  }));
});

test('acuerdo mutuo sólo acepta solicitudes auténticas y de la institución del listing', async () => {
  await seedCanonicalTransaction('tx-mutual');
  const alice = env.authenticatedContext('alice').firestore();
  const bob = env.authenticatedContext('bob').firestore();
  const base = { transaction_id: 'tx-mutual', kind: 'mutual_cancel', institution_id: 'uatx', status: 'open', created_at: now(), updated_at: now() };
  await assertSucceeds(setDoc(doc(alice, 'transaction_cancellation_requests/tx-mutual-alice'), { ...base, requester_uid: 'alice' }));
  await assertSucceeds(setDoc(doc(bob, 'transaction_cancellation_requests/tx-mutual-bob'), { ...base, requester_uid: 'bob' }));
  await assertFails(setDoc(doc(alice, 'transaction_cancellation_requests/tx-mutual-fake'), { ...base, requester_uid: 'bob' }));
  await assertFails(setDoc(doc(alice, 'transaction_cancellation_requests/tx-mutual-alice-wrong'), { ...base, requester_uid: 'alice', institution_id: 'buap' }));
});

test('no-show sólo puede reclamarse contra la contraparte después del encuentro y en la institución real', async () => {
  const meetupPast = Timestamp.fromMillis(Date.now() - 31 * 60_000);
  const meetupFuture = Timestamp.fromMillis(Date.now() + 60 * 60_000);
  await seedCanonicalTransaction('tx-past', 'meetup_scheduled', meetupPast);
  await seedCanonicalTransaction('tx-future', 'meetup_scheduled', meetupFuture);
  const alice = env.authenticatedContext('alice').firestore();
  const windowStart = now();
  const claim = {
    transaction_id: 'tx-past', claimant_uid: 'alice', accused_uid: 'bob', kind: 'seller_no_show', institution_id: 'uatx', reason: 'Esperé más de 30 minutos', status: 'open', created_at: now(), updated_at: now(),
  };

  await assertFails(setDoc(doc(alice, 'transaction_outcome_claims/no-rate'), claim));
  await assertSucceeds(rateBatch(alice, 'alice', 'report_create', 1, windowStart, (batch) => {
    batch.set(doc(alice, 'transaction_outcome_claims/tx-past-alice'), claim);
  }));
  await assertFails(rateBatch(alice, 'alice', 'report_create', 2, windowStart, (batch) => {
    batch.set(doc(alice, 'transaction_outcome_claims/tx-past-alice-wrong'), claim);
  }));
  await assertFails(rateBatch(alice, 'alice', 'report_create', 2, windowStart, (batch) => {
    batch.set(doc(alice, 'transaction_outcome_claims/tx-past-alice-2'), { ...claim, institution_id: 'buap' });
  }));
  await assertFails(rateBatch(alice, 'alice', 'report_create', 2, windowStart, (batch) => {
    batch.set(doc(alice, 'transaction_outcome_claims/tx-future-alice'), { ...claim, transaction_id: 'tx-future' });
  }));
});