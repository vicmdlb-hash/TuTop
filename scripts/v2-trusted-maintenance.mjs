import crypto from 'node:crypto';
import { firebaseCiAccessToken } from './firebase-ci-auth.mjs';

const projectId = String(process.env.TUTOP_FIREBASE_PROJECT_ID || '').trim();
const allow = String(process.env.TUTOP_ALLOW_V2_MAINTENANCE || '').trim();
const apply = process.argv.includes('--apply');
const historicalProject = 'tutop-3a4f7';
const tasksArg = process.argv.find((value) => value.startsWith('--tasks='));
const tasks = new Set((tasksArg ? tasksArg.split('=')[1] : 'outcomes,reputation,credentials,saved-searches,push').split(',').map((value) => value.trim()).filter(Boolean));
const limit = Math.max(1, Math.min(500, Number(process.env.TUTOP_V2_MAINTENANCE_LIMIT || 300)));

function stop(message) { console.error(`DETENIDO: ${message}`); process.exit(2); }
if (!projectId) stop('falta TUTOP_FIREBASE_PROJECT_ID.');
if (projectId === historicalProject) stop(`${historicalProject} está bloqueado para mantenimiento V2.`);
if (/prod(uction)?/i.test(projectId) && process.env.TUTOP_ALLOW_PRODUCTION_FIREBASE !== '1') stop('el project ID parece producción.');
if (!/(staging|stage|beta|dev|test|sandbox)/i.test(projectId) && process.env.TUTOP_ALLOW_NONDESCRIPTIVE_STAGING_ID !== '1') stop('el project ID no parece staging/beta/dev/test.');
if (apply && allow !== 'staging-v2') stop('para escribir define TUTOP_ALLOW_V2_MAINTENANCE=staging-v2.');

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
    if (/_at$|^updated_at$|^created_at$|^sent_at$/.test(key) && /^\d{4}-\d{2}-\d{2}T/.test(value)) return { timestampValue: value };
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
function patchWrite(path, data, deleteFields = []) {
  return { update: { name: docName(path), fields: encodeFields(data) }, updateMask: { fieldPaths: [...Object.keys(data), ...deleteFields] } };
}
function createWrite(path, data) { return { update: { name: docName(path), fields: encodeFields(data) }, currentDocument: { exists: false } }; }
function deleteWrite(path) { return { delete: docName(path) }; }

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

async function query(collectionId, max = limit) {
  const result = await request(`${base}:runQuery`, {
    method: 'POST',
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId }], limit: max } }),
  });
  return (result.data || []).filter((row) => row.document).map((row) => ({ id: row.document.name.split('/').pop(), ...decodeFields(row.document.fields || {}) }));
}
async function commit(writes) {
  if (!writes.length || !apply) return;
  await request(`${base}:commit`, { method: 'POST', body: JSON.stringify({ writes }) });
}
function auditWrite(action, targetType, targetId, extra = {}) {
  const at = new Date().toISOString();
  return createWrite(`audit_log/system-${action}-${crypto.randomUUID()}`, { actor_type: 'system', action, target_type: targetType, target_id: targetId, ...extra, created_at: at });
}

async function runOutcomes() {
  const [transactions, claims, cancellationRequests] = await Promise.all([
    query('transactions_v2'), query('transaction_outcome_claims'), query('transaction_cancellation_requests'),
  ]);
  const txById = new Map(transactions.map((tx) => [tx.id, tx]));
  let resolvedNoShows = 0; let resolvedMutual = 0;

  for (const claim of claims.filter((item) => item.status === 'upheld')) {
    const tx = txById.get(claim.transaction_id);
    if (!tx || !['meetup_scheduled', 'disputed'].includes(tx.status)) continue;
    if (!['buyer_no_show', 'seller_no_show'].includes(claim.kind)) continue;
    if (claim.accused_uid !== tx.buyer_id && claim.accused_uid !== tx.seller_id) continue;
    const expected = claim.accused_uid === tx.buyer_id ? 'buyer_no_show' : 'seller_no_show';
    if (claim.kind !== expected) continue;
    const at = new Date().toISOString();
    await commit([
      patchWrite(`transactions_v2/${tx.id}`, { status: 'no_show', outcome_code: expected, outcome_actor_id: claim.accused_uid, outcome_recorded_at: at, updated_at: at }),
      deleteWrite(`listing_reservation_locks/${tx.listing_id}`),
      auditWrite('no_show_upheld', 'transaction', tx.id, { outcome_code: expected }),
    ]);
    resolvedNoShows += 1;
  }

  const mutualByTx = new Map();
  for (const requestDoc of cancellationRequests.filter((item) => item.status === 'open' && item.kind === 'mutual_cancel')) {
    const list = mutualByTx.get(requestDoc.transaction_id) || [];
    list.push(requestDoc);
    mutualByTx.set(requestDoc.transaction_id, list);
  }
  for (const [transactionId, requests] of mutualByTx) {
    const tx = txById.get(transactionId);
    if (!tx || !['reserved', 'meetup_scheduled'].includes(tx.status) || tx.buyer_confirmed_at || tx.seller_confirmed_at) continue;
    const requesters = new Set(requests.map((item) => item.requester_uid));
    if (!requesters.has(tx.buyer_id) || !requesters.has(tx.seller_id)) continue;
    const at = new Date().toISOString();
    const writes = [
      patchWrite(`transactions_v2/${tx.id}`, { status: 'cancelled', outcome_code: 'mutual_cancel', outcome_recorded_at: at, updated_at: at }, ['outcome_actor_id']),
      deleteWrite(`listing_reservation_locks/${tx.listing_id}`),
      auditWrite('mutual_cancel_completed', 'transaction', tx.id),
      ...requests.filter((item) => item.requester_uid === tx.buyer_id || item.requester_uid === tx.seller_id).map((item) => patchWrite(`transaction_cancellation_requests/${item.id}`, { status: 'resolved', updated_at: at })),
    ];
    await commit(writes);
    resolvedMutual += 1;
  }
  console.log(`outcomes: ${resolvedNoShows} no-show(s), ${resolvedMutual} cancelación(es) mutua(s) ${apply ? 'resueltos' : 'planificados'}.`);
  return resolvedNoShows + resolvedMutual;
}

function positiveRate(positive, total) { return total > 0 ? Math.round((positive / total) * 100) : null; }
function reputationFor(uid, transactions, reviews, moderationCases) {
  const participant = transactions.filter((tx) => tx.buyer_id === uid || tx.seller_id === uid);
  const completed = participant.filter((tx) => tx.status === 'completed');
  const completedChats = new Map(completed.map((tx) => [tx.chat_id, tx]));
  let sellerReviewCount = 0; let sellerPositiveCount = 0; let buyerReviewCount = 0; let buyerPositiveCount = 0;
  for (const review of reviews) {
    if (review.evaluado_id !== uid) continue;
    const tx = completedChats.get(review.chat_id);
    if (!tx) continue;
    if (tx.seller_id === uid) { sellerReviewCount += 1; if (review.calificacion === 'positive') sellerPositiveCount += 1; }
    if (tx.buyer_id === uid) { buyerReviewCount += 1; if (review.calificacion === 'positive') buyerPositiveCount += 1; }
  }
  const cancellations = participant.filter((tx) => tx.status === 'cancelled' && tx.outcome_code !== 'mutual_cancel' && (!tx.outcome_actor_id || tx.outcome_actor_id === uid)).length;
  const noShows = participant.filter((tx) => tx.status === 'no_show' && (!tx.outcome_actor_id || tx.outcome_actor_id === uid)).length;
  const reportsUpheld = moderationCases.filter((item) => item.target_type === 'user' && item.target_id === uid && item.status === 'resolved' && item.result === 'upheld').length;
  return {
    subject_uid: uid,
    completed_transactions: completed.length,
    completed_as_seller: completed.filter((tx) => tx.seller_id === uid).length,
    completed_as_buyer: completed.filter((tx) => tx.buyer_id === uid).length,
    seller_review_count: sellerReviewCount,
    seller_positive_count: sellerPositiveCount,
    seller_positive_rate: positiveRate(sellerPositiveCount, sellerReviewCount),
    buyer_review_count: buyerReviewCount,
    buyer_positive_count: buyerPositiveCount,
    buyer_positive_rate: positiveRate(buyerPositiveCount, buyerReviewCount),
    cancellations,
    no_shows: noShows,
    reports_upheld: reportsUpheld,
    updated_at: new Date().toISOString(),
  };
}

async function runReputation() {
  const [transactions, reviews, moderationCases] = await Promise.all([query('transactions_v2'), query('reviews'), query('moderation_cases')]);
  const users = [...new Set(transactions.flatMap((tx) => [tx.buyer_id, tx.seller_id]).filter(Boolean))];
  const writes = users.map((uid) => patchWrite(`reputation/${uid}`, reputationFor(uid, transactions, reviews, moderationCases)));
  await commit(writes);
  console.log(`reputation: ${writes.length} snapshot(s) ${apply ? 'persistidos' : 'planificados'}.`);
  return writes.length;
}

async function runCredentialPurge() {
  const requests = await query('verificationRequests');
  const now = Date.now();
  const candidates = requests.filter((item) => {
    if (!['approved', 'rejected'].includes(item.status) || !item.image_data || !item.retention_delete_after) return false;
    const deadline = Date.parse(item.retention_delete_after);
    return Number.isFinite(deadline) && deadline <= now;
  });
  const writes = [];
  for (const item of candidates) {
    const at = new Date().toISOString();
    writes.push(patchWrite(`verificationRequests/${item.id}`, { updated_at: at }, ['image_data']));
    writes.push(auditWrite('credential_image_purged', 'verification_request', item.id));
  }
  await commit(writes);
  console.log(`credentials: ${candidates.length} imagen(es) ${apply ? 'purgadas' : 'planificadas'}.`);
  return candidates.length;
}

function normalize(value = '') { return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim(); }
function slug(value = '') { return normalize(value).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
function savedSearchMatches(search, listing) {
  if (!search.notifications_enabled || listing.status !== 'active' || listing.moderation_status !== 'approved') return false;
  if (search.category && slug(search.category) !== slug(listing.category_id)) return false;
  if (typeof search.max_price_mxn === 'number' && Number(listing.price_mxn) > search.max_price_mxn) return false;
  if (search.campus_id && listing.campus_id !== search.campus_id) return false;
  if (!search.campus_id && search.institution_id && listing.institution_id !== search.institution_id) return false;
  if (search.visibility_scope === 'national' && listing.visibility_scope !== 'national') return false;
  const terms = normalize(search.query).split(/\s+/).filter(Boolean);
  const haystack = normalize(`${listing.title || ''} ${listing.description || ''} ${listing.category_id || ''} ${JSON.stringify(listing.attributes || {})}`);
  return terms.every((term) => haystack.includes(term));
}
function deterministicNotificationId(searchId, listingId) { return crypto.createHash('sha256').update(`${searchId}:${listingId}`).digest('hex').slice(0, 40); }

async function runSavedSearches() {
  const [searches, listings] = await Promise.all([query('saved_searches'), query('listings_v2')]);
  const recentCutoff = Date.now() - Math.max(1, Math.min(168, Number(process.env.TUTOP_SAVED_SEARCH_LOOKBACK_HOURS || 24))) * 3600000;
  const eligibleListings = listings.filter((listing) => {
    const when = Date.parse(listing.published_at || listing.created_at || listing.updated_at || '');
    return listing.status === 'active' && listing.moderation_status === 'approved' && Number.isFinite(when) && when >= recentCutoff;
  });
  const writes = [];
  for (const search of searches) {
    for (const listing of eligibleListings) {
      if (listing.seller_id === search.owner_uid || !savedSearchMatches(search, listing)) continue;
      const id = deterministicNotificationId(search.id, listing.id);
      const at = new Date().toISOString();
      writes.push(createWrite(`notification_outbox/${id}`, {
        recipient_uid: search.owner_uid,
        kind: 'saved_search_match',
        listing_id: listing.id,
        saved_search_id: search.id,
        title: 'Tu búsqueda encontró algo',
        body: `${String(listing.title || 'Nueva publicación').slice(0, 90)} · $${Math.round(Number(listing.price_mxn || 0)).toLocaleString('es-MX')}`,
        status: 'pending', attempts: 0, created_at: at, updated_at: at,
      }));
    }
  }
  let created = 0;
  for (const write of writes) {
    if (!apply) { created += 1; continue; }
    try { await commit([write]); created += 1; }
    catch (error) { if (!/ALREADY_EXISTS|409|already exists/i.test(String(error.message))) throw error; }
  }
  console.log(`saved-searches: ${created} alerta(s) ${apply ? 'encoladas' : 'planificadas'} sin duplicados.`);
  return created;
}

async function runPush() {
  const [outbox, tokens] = await Promise.all([query('notification_outbox'), query('device_tokens')]);
  const pending = outbox.filter((item) => item.status === 'pending');
  let sent = 0; let waiting = 0;
  for (const item of pending) {
    const targets = tokens.filter((tokenDoc) => tokenDoc.owner_uid === item.recipient_uid && tokenDoc.active !== false && tokenDoc.token);
    if (!targets.length) { waiting += 1; continue; }
    if (!apply) { sent += targets.length; continue; }
    let delivered = 0;
    for (const target of targets) {
      const response = await fetch(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/messages:send`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: {
          token: target.token,
          notification: { title: item.title || 'TuTop', body: item.body || '' },
          data: Object.fromEntries(Object.entries({ kind: item.kind, listing_id: item.listing_id, saved_search_id: item.saved_search_id, transaction_id: item.transaction_id, chat_id: item.chat_id }).filter(([, value]) => value).map(([key, value]) => [key, String(value)])),
        } }),
      });
      if (response.ok) delivered += 1;
      else {
        const detail = await response.text();
        console.warn(`FCM ${item.id}/${target.id}: ${response.status} ${detail.slice(0, 220)}`);
      }
    }
    if (delivered > 0) {
      const at = new Date().toISOString();
      await commit([patchWrite(`notification_outbox/${item.id}`, { status: 'sent', attempts: Number(item.attempts || 0) + 1, sent_at: at, updated_at: at })]);
      sent += delivered;
    }
  }
  console.log(`push: ${sent} entrega(s) ${apply ? 'enviadas' : 'planificadas'}; ${waiting} alerta(s) esperan token de dispositivo.`);
  return sent;
}

const results = {};
if (tasks.has('outcomes')) results.outcomes = await runOutcomes();
if (tasks.has('reputation')) results.reputation = await runReputation();
if (tasks.has('credentials')) results.credentials = await runCredentialPurge();
if (tasks.has('saved-searches')) results.savedSearches = await runSavedSearches();
if (tasks.has('push')) results.push = await runPush();

console.log(`\n✅ TuTop trusted maintenance ${apply ? 'APPLY' : 'DRY RUN'} · ${projectId}`);
console.table(results);
