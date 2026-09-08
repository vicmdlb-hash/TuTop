import fs from 'node:fs';
import test, { after, beforeEach } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { collection, doc, getCountFromServer, query, setDoc, Timestamp, where } from 'firebase/firestore';

const projectId = process.env.GCLOUD_PROJECT || 'demo-tutop-v2-rules';
const host = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const [hostname, portRaw] = host.split(':');
const rules = fs.readFileSync('firebase/firestore.v2.generated.rules', 'utf8');
const env = await initializeTestEnvironment({ projectId, firestore: { host: hostname, port: Number(portRaw || 8080), rules } });

after(async () => env.cleanup());
beforeEach(async () => env.clearFirestore());

const ts = (millis) => Timestamp.fromMillis(millis);

async function seedReviews() {
  const now = Date.now();
  const recent = now - 2 * 86400000;
  const old = now - 45 * 86400000;
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'reviews/recent-negative-for-alice'), {
      chat_id: 'chat-1', evaluador_id: 'bob', evaluado_id: 'alice', calificacion: 'negative', comentario: '', fecha: ts(recent),
    });
    await setDoc(doc(db, 'reviews/recent-positive-for-alice'), {
      chat_id: 'chat-2', evaluador_id: 'carol', evaluado_id: 'alice', calificacion: 'positive', comentario: '', fecha: ts(recent),
    });
    await setDoc(doc(db, 'reviews/old-negative-for-alice'), {
      chat_id: 'chat-3', evaluador_id: 'dave', evaluado_id: 'alice', calificacion: 'negative', comentario: '', fecha: ts(old),
    });
    await setDoc(doc(db, 'reviews/recent-negative-by-alice'), {
      chat_id: 'chat-4', evaluador_id: 'alice', evaluado_id: 'erin', calificacion: 'negative', comentario: '', fecha: ts(recent),
    });
  });
  return now;
}

function strikeQuery(db, uid, cutoffMillis) {
  return query(
    collection(db, 'reviews'),
    where('evaluado_id', '==', uid),
    where('calificacion', '==', 'negative'),
    where('fecha', '>=', ts(cutoffMillis)),
  );
}

test('usuario obtiene COUNT exacto de reviews negativas recibidas en 30 días', async () => {
  const now = await seedReviews();
  const alice = env.authenticatedContext('alice').firestore();
  const result = await assertSucceeds(getCountFromServer(strikeQuery(alice, 'alice', now - 30 * 86400000)));
  if (result.data().count !== 1) throw new Error(`STRIKE_COUNT_MISMATCH:${result.data().count}`);
});

test('reviews positivas, emitidas por el usuario y negativas antiguas no cuentan como strike', async () => {
  const now = await seedReviews();
  const alice = env.authenticatedContext('alice').firestore();
  const result = await assertSucceeds(getCountFromServer(strikeQuery(alice, 'alice', now - 30 * 86400000)));
  if (result.data().count !== 1) throw new Error(`STRIKE_FILTER_MISMATCH:${result.data().count}`);
});

test('usuario ajeno no puede agregar las reviews privadas recibidas por otra persona', async () => {
  const now = await seedReviews();
  const mallory = env.authenticatedContext('mallory').firestore();
  await assertFails(getCountFromServer(strikeQuery(mallory, 'alice', now - 30 * 86400000)));
});
