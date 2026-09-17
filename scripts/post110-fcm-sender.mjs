import { firebaseCiAccessToken } from './firebase-ci-auth.mjs';
import { fcmDataForNotification } from './fcm-payload-lib.mjs';

const STAGING_PROJECT = 'tutop-beta-vicmdlb-1356585881';
const projectId = String(process.env.TUTOP_FIREBASE_PROJECT_ID || '').trim();
const apply = process.argv.includes('--apply');
const allow = String(process.env.TUTOP_ALLOW_V2_MAINTENANCE || '').trim();
const limit = Math.max(1, Math.min(500, Number(process.env.TUTOP_POST110_FCM_LIMIT || 300)));

function stop(message) {
  console.error(`DETENIDO: ${message}`);
  process.exit(2);
}

if (projectId !== STAGING_PROJECT) stop(`post110 FCM sender requiere ${STAGING_PROJECT}.`);
if (apply && allow !== 'staging-v2') stop('post110 FCM apply requiere TUTOP_ALLOW_V2_MAINTENANCE=staging-v2.');

const token = await firebaseCiAccessToken();
const base = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents`;

function decodeValue(value = {}) {
  if ('nullValue' in value) return null;
  if ('stringValue' in value) return value.stringValue;
  if ('timestampValue' in value) return value.timestampValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(decodeValue);
  if ('mapValue' in value) return decodeFields(value.mapValue.fields || {});
  return undefined;
}

function decodeFields(fields = {}) {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, decodeValue(value)]));
}

function encodeValue(value, key = '') {
  if (value === null) return { nullValue: null };
  if (typeof value === 'string') {
    if (/_at$|^updated_at$|^created_at$|^sent_at$/.test(key) && /^\d{4}-\d{2}-\d{2}T/.test(value)) return { timestampValue: value };
    return { stringValue: value };
  }
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map((item) => encodeValue(item)) } };
  if (typeof value === 'object') return { mapValue: { fields: encodeFields(value) } };
  return { stringValue: String(value) };
}

function encodeFields(data) {
  return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined).map(([key, value]) => [key, encodeValue(value, key)]));
}

async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const text = await response.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
  }
  if (!response.ok) throw new Error(`${response.status} ${url}: ${text.slice(0, 800)}`);
  return data;
}

async function query(collectionId) {
  const rows = await request(`${base}:runQuery`, {
    method: 'POST',
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId }], limit } }),
  });
  return (rows || []).filter((row) => row.document).map((row) => ({
    id: row.document.name.split('/').pop(),
    ...decodeFields(row.document.fields || {}),
  }));
}

async function markSent(item) {
  const at = new Date().toISOString();
  const name = `projects/${projectId}/databases/(default)/documents/notification_outbox/${item.id}`;
  const fields = encodeFields({
    status: 'sent',
    attempts: Number(item.attempts || 0) + 1,
    sent_at: at,
    updated_at: at,
  });
  await request(`${base}:commit`, {
    method: 'POST',
    body: JSON.stringify({
      writes: [{
        update: { name, fields },
        updateMask: { fieldPaths: Object.keys(fields) },
      }],
    }),
  });
}

const [outbox, tokens] = await Promise.all([query('notification_outbox'), query('device_tokens')]);
const pending = outbox.filter((item) => item.status === 'pending');
let planned = 0;
let delivered = 0;
let waitingForToken = 0;

for (const item of pending) {
  const targets = tokens.filter((target) => target.owner_uid === item.recipient_uid && target.active !== false && target.token);
  if (!targets.length) {
    waitingForToken += 1;
    continue;
  }

  const data = fcmDataForNotification(item);
  if (!apply) {
    planned += targets.length;
    continue;
  }

  let deliveredForItem = 0;
  for (const target of targets) {
    const response = await fetch(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/messages:send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: {
          token: target.token,
          notification: { title: item.title || 'TuTop', body: item.body || '' },
          data,
        },
      }),
    });
    if (response.ok) {
      deliveredForItem += 1;
      delivered += 1;
    } else {
      const detail = await response.text();
      console.warn(`FCM ${item.id}/${target.id}: ${response.status} ${detail.slice(0, 220)}`);
    }
  }

  if (deliveredForItem > 0) await markSent(item);
}

console.log(JSON.stringify({
  mode: apply ? 'APPLY' : 'DRY_RUN',
  project: projectId,
  pending_notifications: pending.length,
  planned_deliveries: planned,
  delivered,
  waiting_for_device_token: waitingForToken,
  notification_id_in_payload: true,
  real_fcm_sent: apply && delivered > 0,
}, null, 2));
