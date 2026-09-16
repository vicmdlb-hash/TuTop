import { firebaseCiAccessToken } from './firebase-ci-auth.mjs';
import { projectMarketplaceNotifications } from './marketplace-notification-projection-lib.mjs';

const projectId = String(process.env.TUTOP_FIREBASE_PROJECT_ID || '').trim();
const allow = String(process.env.TUTOP_ALLOW_V2_MAINTENANCE || '').trim();
const apply = process.argv.includes('--apply');
const applyAck = String(process.env.TUTOP_MARKETPLACE_NOTIFICATION_APPLY_ACK || '').trim();
const historicalProject = 'tutop-3a4f7';
const limit = Math.max(20, Math.min(1000, Number(process.env.TUTOP_MARKETPLACE_NOTIFICATION_LIMIT || 300)));
const lookbackMinutes = Math.max(1, Math.min(1440, Number(process.env.TUTOP_MARKETPLACE_NOTIFICATION_LOOKBACK_MINUTES || 10)));
const cutoffIso = new Date(Date.now() - lookbackMinutes * 60_000).toISOString();

function stop(message) { console.error(`DETENIDO: ${message}`); process.exit(2); }
if (!projectId) stop('falta TUTOP_FIREBASE_PROJECT_ID.');
if (projectId === historicalProject) stop(`${historicalProject} está bloqueado.`);
if (/prod(uction)?/i.test(projectId) && process.env.TUTOP_ALLOW_PRODUCTION_FIREBASE !== '1') stop('el project ID parece producción.');
if (!/(staging|stage|beta|dev|test|sandbox)/i.test(projectId) && process.env.TUTOP_ALLOW_NONDESCRIPTIVE_STAGING_ID !== '1') stop('el project ID no parece staging/beta/dev/test.');
if (apply && allow !== 'staging-v2') stop('para escribir define TUTOP_ALLOW_V2_MAINTENANCE=staging-v2.');
if (apply && applyAck !== 'SEND_STAGING_MARKETPLACE_NOTIFICATIONS') stop('para escribir confirma TUTOP_MARKETPLACE_NOTIFICATION_APPLY_ACK=SEND_STAGING_MARKETPLACE_NOTIFICATIONS.');

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

function decodeQueryRows(rows = []) {
  return rows.filter((row) => row.document).map((row) => {
    const name = String(row.document.name || '');
    const marker = '/documents/';
    const path = name.includes(marker) ? name.split(marker)[1] : name;
    const parts = path.split('/').filter(Boolean);
    return { id: parts.at(-1) || '', _path: path, _parts: parts, ...decodeFields(row.document.fields || {}) };
  });
}

async function queryRecent(collectionId, timestampField, { allDescendants = false } = {}) {
  const response = await request(`${root}:runQuery`, {
    method: 'POST',
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId, ...(allDescendants ? { allDescendants: true } : {}) }],
        where: { fieldFilter: { field: { fieldPath: timestampField }, op: 'GREATER_THAN_OR_EQUAL', value: { timestampValue: cutoffIso } } },
        orderBy: [{ field: { fieldPath: timestampField }, direction: 'DESCENDING' }],
        limit,
      },
    }),
  });
  return decodeQueryRows(response.data || []);
}

async function getDocument(path) {
  const result = await request(`${root}/${path}`, { method: 'GET' }, [404]);
  if (result.status === 404 || !result.data?.name) return null;
  const parts = path.split('/').filter(Boolean);
  return { id: parts.at(-1) || '', _path: path, _parts: parts, ...decodeFields(result.data.fields || {}) };
}

async function createOutbox(notification) {
  const { id, source_event_at, ...payload } = notification;
  const at = new Date().toISOString();
  const document = { ...payload, source_event_at, created_at: at, updated_at: at };
  const url = `${root}/notification_outbox?documentId=${encodeURIComponent(id)}`;
  return request(url, { method: 'POST', body: JSON.stringify({ fields: encodeFields(document) }) }, [409]);
}

const [messagesRaw, offers, transactions] = await Promise.all([
  queryRecent('messages', 'created_at', { allDescendants: true }),
  queryRecent('offers', 'updated_at'),
  queryRecent('transactions_v2', 'updated_at'),
]);

const messages = messagesRaw.map((message) => {
  const parts = message._parts || [];
  const chatsIndex = parts.lastIndexOf('chats');
  const chatId = chatsIndex >= 0 ? parts[chatsIndex + 1] : '';
  return { ...message, chat_id: chatId };
});
const neededChatIds = [...new Set(messages.map((message) => String(message.chat_id || '')).filter(Boolean))];
const chatDocs = await Promise.all(neededChatIds.map((chatId) => getDocument(`chats/${chatId}`)));
const chats = chatDocs.filter(Boolean);

const projected = projectMarketplaceNotifications({
  chats,
  messages,
  offers,
  transactions,
  lookbackMs: lookbackMinutes * 60_000,
});

let created = 0;
let duplicates = 0;
for (const notification of projected) {
  if (!apply) { created += 1; continue; }
  const result = await createOutbox(notification);
  if (result.status === 409) duplicates += 1;
  else created += 1;
}

console.log(`marketplace-notifications: cutoff=${cutoffIso}; projected=${projected.length} ${apply ? `created=${created} duplicates=${duplicates}` : 'dry-run'}; chats=${chats.length} messages=${messages.length} offers=${offers.length} transactions=${transactions.length}.`);
