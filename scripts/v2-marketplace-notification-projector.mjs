import { firebaseCiAccessToken } from './firebase-ci-auth.mjs';
import { projectMarketplaceNotifications } from './marketplace-notification-projection-lib.mjs';

const projectId = String(process.env.TUTOP_FIREBASE_PROJECT_ID || '').trim();
const allow = String(process.env.TUTOP_ALLOW_V2_MAINTENANCE || '').trim();
const apply = process.argv.includes('--apply');
const historicalProject = 'tutop-3a4f7';
const limit = Math.max(20, Math.min(1000, Number(process.env.TUTOP_MARKETPLACE_NOTIFICATION_LIMIT || 500)));
const lookbackHours = Math.max(1, Math.min(168, Number(process.env.TUTOP_MARKETPLACE_NOTIFICATION_LOOKBACK_HOURS || 48)));

function stop(message) { console.error(`DETENIDO: ${message}`); process.exit(2); }
if (!projectId) stop('falta TUTOP_FIREBASE_PROJECT_ID.');
if (projectId === historicalProject) stop(`${historicalProject} está bloqueado.`);
if (/prod(uction)?/i.test(projectId) && process.env.TUTOP_ALLOW_PRODUCTION_FIREBASE !== '1') stop('el project ID parece producción.');
if (!/(staging|stage|beta|dev|test|sandbox)/i.test(projectId) && process.env.TUTOP_ALLOW_NONDESCRIPTIVE_STAGING_ID !== '1') stop('el project ID no parece staging/beta/dev/test.');
if (apply && allow !== 'staging-v2') stop('para escribir define TUTOP_ALLOW_V2_MAINTENANCE=staging-v2.');

const token = await firebaseCiAccessToken();
const root = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents`;

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
function decodeFields(fields = {}) { return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, decodeValue(value)])); }
function encodeValue(value, key = '') {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'string') {
    if (/(^|_)at$|^source_event_at$/.test(key) && /^\d{4}-\d{2}-\d{2}T/.test(value)) return { timestampValue: value };
    return { stringValue: value };
  }
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map((item) => encodeValue(item)) } };
  if (typeof value === 'object') return { mapValue: { fields: encodeFields(value) } };
  return { stringValue: String(value) };
}
function encodeFields(data) { return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined).map(([key, value]) => [key, encodeValue(value, key)])); }
function docName(path) { return `projects/${projectId}/databases/(default)/documents/${path}`; }

async function request(url, options = {}, allowStatuses = []) {
  const response = await fetch(url, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const text = await response.text();
  let data = null;
  if (text) { try { data = JSON.parse(text); } catch { data = { raw: text }; } }
  if (!response.ok && !allowStatuses.includes(response.status)) throw new Error(`${response.status} ${url}: ${text.slice(0, 800)}`);
  return { status: response.status, data };
}

async function query(collectionId, { allDescendants = false } = {}) {
  const response = await request(`${root}:runQuery`, {
    method: 'POST',
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId, ...(allDescendants ? { allDescendants: true } : {}) }], limit } }),
  });
  return (response.data || []).filter((row) => row.document).map((row) => {
    const name = String(row.document.name || '');
    const marker = '/documents/';
    const path = name.includes(marker) ? name.split(marker)[1] : name;
    const parts = path.split('/').filter(Boolean);
    return { id: parts.at(-1) || '', _path: path, _parts: parts, ...decodeFields(row.document.fields || {}) };
  });
}

async function createOutbox(notification) {
  const { id, source_event_at, ...payload } = notification;
  const at = new Date().toISOString();
  const document = {
    ...payload,
    source_event_at,
    created_at: at,
    updated_at: at,
  };
  const url = `${root}/notification_outbox?documentId=${encodeURIComponent(id)}`;
  return request(url, { method: 'POST', body: JSON.stringify({ fields: encodeFields(document) }) }, [409]);
}

const [chatsRaw, messagesRaw, offers, transactions] = await Promise.all([
  query('chats'),
  query('messages', { allDescendants: true }),
  query('offers'),
  query('transactions_v2'),
]);

const chats = chatsRaw.map((chat) => ({ ...chat, id: chat.id }));
const messages = messagesRaw.map((message) => {
  const parts = message._parts || [];
  const chatsIndex = parts.lastIndexOf('chats');
  const chatId = chatsIndex >= 0 ? parts[chatsIndex + 1] : '';
  return { ...message, chat_id: chatId };
});

const projected = projectMarketplaceNotifications({
  chats,
  messages,
  offers,
  transactions,
  lookbackMs: lookbackHours * 3600_000,
});

let created = 0;
let duplicates = 0;
for (const notification of projected) {
  if (!apply) { created += 1; continue; }
  const result = await createOutbox(notification);
  if (result.status === 409) duplicates += 1;
  else created += 1;
}

console.log(`marketplace-notifications: projected=${projected.length} ${apply ? `created=${created} duplicates=${duplicates}` : 'dry-run'}; chats=${chats.length} messages=${messages.length} offers=${offers.length} transactions=${transactions.length}.`);
