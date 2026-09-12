import crypto from 'node:crypto';
import { firebaseCiAccessToken } from './firebase-ci-auth.mjs';

const projectId = String(process.env.TUTOP_FIREBASE_PROJECT_ID || '').trim();
const allow = String(process.env.TUTOP_ALLOW_V2_OBSERVABILITY || '').trim();
const apply = process.argv.includes('--apply');
const historicalProject = 'tutop-3a4f7';
const limit = Math.max(50, Math.min(1000, Number(process.env.TUTOP_V2_OBSERVABILITY_LIMIT || 700)));

function stop(message) { console.error(`DETENIDO: ${message}`); process.exit(2); }
if (!projectId) stop('falta TUTOP_FIREBASE_PROJECT_ID.');
if (projectId === historicalProject) stop(`${historicalProject} está bloqueado para observabilidad V2.`);
if (/prod(uction)?/i.test(projectId) && process.env.TUTOP_ALLOW_PRODUCTION_FIREBASE !== '1') stop('el project ID parece producción.');
if (!/(staging|stage|beta|dev|test|sandbox)/i.test(projectId) && process.env.TUTOP_ALLOW_NONDESCRIPTIVE_STAGING_ID !== '1') stop('el project ID no parece staging/beta/dev/test.');
if (apply && allow !== 'staging-v2') stop('para escribir define TUTOP_ALLOW_V2_OBSERVABILITY=staging-v2.');

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
function decodeFields(fields = {}) { return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, decodeValue(value)])); }
function encodeValue(value, key = '') {
  if (value === null) return { nullValue: null };
  if (typeof value === 'string') {
    if (/_at$|^window_start$|^window_end$/.test(key) && /^\d{4}-\d{2}-\d{2}T/.test(value)) return { timestampValue: value };
    return { stringValue: value };
  }
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map((item) => encodeValue(item)) } };
  if (typeof value === 'object') return { mapValue: { fields: encodeFields(value) } };
  return { stringValue: String(value) };
}
function encodeFields(data) { return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined).map(([key, value]) => [key, encodeValue(value, key)])); }

async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const text = await response.text();
  let data = null;
  if (text) { try { data = JSON.parse(text); } catch { data = { raw: text }; } }
  if (!response.ok) throw new Error(`${response.status} ${url}: ${text.slice(0, 800)}`);
  return data;
}

async function query(collectionId) {
  const rows = await request(`${base}:runQuery`, {
    method: 'POST',
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId }], limit } }),
  });
  return (rows || []).filter((row) => row.document).map((row) => ({ id: row.document.name.split('/').pop(), ...decodeFields(row.document.fields || {}) }));
}

function timeOf(item) {
  const value = item.updated_at || item.created_at || item.published_at || item.last_message_at;
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : 0;
}
function percentage(numerator, denominator) { return denominator > 0 ? Math.round((numerator / denominator) * 1000) / 10 : null; }
function hourlyBucket(now = new Date()) {
  const start = new Date(now); start.setUTCMinutes(0, 0, 0);
  const end = new Date(start.getTime() + 60 * 60_000);
  return { id: start.toISOString().replace(/[:.]/g, '-'), start: start.toISOString(), end: end.toISOString() };
}

const [listings, chats, offers, transactions, reports, demands, savedSearches] = await Promise.all([
  query('listings_v2'), query('chats'), query('offers'), query('transactions_v2'), query('reports'), query('demand_requests'), query('saved_searches'),
]);
const now = Date.now();
const sevenDaysAgo = now - 7 * 86400000;
const activeListings = listings.filter((item) => item.status === 'active' && item.moderation_status === 'approved');
const activeSellers = new Set(activeListings.map((item) => item.seller_id).filter(Boolean));
const recentChats = chats.filter((item) => timeOf(item) >= sevenDaysAgo);
const recentOffers = offers.filter((item) => timeOf(item) >= sevenDaysAgo);
const recentTransactions = transactions.filter((item) => timeOf(item) >= sevenDaysAgo);
const recentReports = reports.filter((item) => timeOf(item) >= sevenDaysAgo);
const recentDemands = demands.filter((item) => timeOf(item) >= sevenDaysAgo);
const completed = recentTransactions.filter((item) => item.status === 'completed');
const noShows = recentTransactions.filter((item) => item.status === 'no_show');
const agreements = recentTransactions.filter((item) => ['reserved','meetup_scheduled','completed','disputed','cancelled','no_show'].includes(item.status));

const interactedListingIds = new Set([
  ...recentChats.map((item) => item.product_id || item.producto_id),
  ...recentOffers.map((item) => item.listing_id),
].filter(Boolean));
const eligibleListings7d = listings.filter((item) => {
  const published = Date.parse(String(item.published_at || item.created_at || ''));
  return item.moderation_status === 'approved' && Number.isFinite(published) && published >= sevenDaysAgo;
});
const usefulListings = eligibleListings7d.filter((item) => interactedListingIds.has(item.id));
const satisfiedDemands = recentDemands.filter((item) => item.status === 'fulfilled' || item.status === 'closed_matched');

const bucket = hourlyBucket();
const snapshot = {
  schema_version: 1,
  environment: 'staging',
  project_id_hash: crypto.createHash('sha256').update(projectId).digest('hex').slice(0, 16),
  window_start: bucket.start,
  window_end: bucket.end,
  generated_at: new Date().toISOString(),
  active_sellers: activeSellers.size,
  active_listings: activeListings.length,
  listings_published_7d: eligibleListings7d.length,
  listings_with_useful_interaction_7d: usefulListings.length,
  useful_interaction_7d_rate: percentage(usefulListings.length, eligibleListings7d.length),
  chats_started_7d: recentChats.length,
  offers_created_7d: recentOffers.length,
  agreements_7d: agreements.length,
  completed_transactions_7d: completed.length,
  agreement_to_completion_rate_7d: percentage(completed.length, agreements.length),
  no_shows_7d: noShows.length,
  no_show_rate_7d: percentage(noShows.length, agreements.length),
  reports_7d: recentReports.length,
  reports_per_1000_completed_7d: completed.length ? Math.round((recentReports.length / completed.length) * 1000 * 10) / 10 : null,
  demand_requests_7d: recentDemands.length,
  demands_satisfied_7d: satisfiedDemands.length,
  needs_satisfied_rate_7d: percentage(satisfiedDemands.length, recentDemands.length),
  saved_searches_total: savedSearches.length,
  search_metrics_available: false,
  source_limit: limit,
};

console.log('TuTop V2 observability snapshot');
console.table({
  active_sellers: snapshot.active_sellers,
  active_listings: snapshot.active_listings,
  useful_interaction_7d_rate: snapshot.useful_interaction_7d_rate,
  offers_7d: snapshot.offers_created_7d,
  completions_7d: snapshot.completed_transactions_7d,
  no_shows_7d: snapshot.no_shows_7d,
  reports_7d: snapshot.reports_7d,
});
console.log('search_metrics_available=false: no se inventan búsquedas/zero-result hasta instrumentar vistas/búsquedas reales.');

if (apply) {
  const path = `analytics_snapshots/staging-hour-${bucket.id}`;
  await request(`${base}/${path}`, { method: 'PATCH', body: JSON.stringify({ fields: encodeFields(snapshot) }) });
  console.log(`✅ Snapshot trusted persistido: ${path}`);
} else {
  console.log('DRY RUN: no se escribió nada.');
}
