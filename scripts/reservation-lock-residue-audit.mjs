import { firebaseCiAccessToken } from './firebase-ci-auth.mjs';

const projectId = String(process.env.TUTOP_FIREBASE_PROJECT_ID || '').trim();
const historicalProject = 'tutop-3a4f7';
const limit = Math.max(1, Math.min(500, Number(process.env.TUTOP_RESERVATION_LOCK_AUDIT_LIMIT || 300)));

function stop(message) {
  console.error(`DETENIDO: ${message}`);
  process.exit(2);
}

if (!projectId) stop('falta TUTOP_FIREBASE_PROJECT_ID.');
if (projectId === historicalProject) stop(`${historicalProject} está bloqueado para auditoría V2.`);
if (/prod(uction)?/i.test(projectId) && process.env.TUTOP_ALLOW_PRODUCTION_FIREBASE !== '1') stop('el project ID parece producción.');
if (!/(staging|stage|beta|dev|test|sandbox)/i.test(projectId) && process.env.TUTOP_ALLOW_NONDESCRIPTIVE_STAGING_ID !== '1') stop('el project ID no parece staging/beta/dev/test.');

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

async function request(url, options = {}, allowStatuses = []) {
  const response = await fetch(url, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const text = await response.text();
  let data = null;
  if (text) { try { data = JSON.parse(text); } catch { data = { raw: text }; } }
  if (!response.ok && !allowStatuses.includes(response.status)) throw new Error(`${response.status} ${text.slice(0, 600)}`);
  return { status: response.status, data };
}

async function queryLocks() {
  const result = await request(`${base}:runQuery`, {
    method: 'POST',
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'listing_reservation_locks' }], limit } }),
  });
  return (result.data || []).filter((row) => row.document).map((row) => ({
    id: row.document.name.split('/').pop(),
    ...decodeFields(row.document.fields || {}),
  }));
}

async function getDoc(path) {
  const result = await request(`${base}/${path.split('/').map(encodeURIComponent).join('/')}`, {}, [404]);
  if (result.status === 404) return null;
  return { id: result.data.name.split('/').pop(), ...decodeFields(result.data.fields || {}) };
}

export function classifyReservationLockResidue(lock, transaction, listing) {
  if (!lock?.id || !lock.transaction_id || !lock.listing_id) return { severity: 'critical', reason: 'malformed_lock' };
  if (!transaction) return { severity: 'critical', reason: 'orphan_lock_missing_transaction' };
  if (transaction.id !== lock.transaction_id || transaction.listing_id !== lock.listing_id) return { severity: 'critical', reason: 'lock_transaction_mismatch' };
  if (!listing) return { severity: 'critical', reason: 'lock_listing_missing' };

  const status = String(transaction.status || '');
  if (['reserved', 'meetup_scheduled', 'disputed'].includes(status)) {
    if (listing.status !== 'active') return { severity: 'critical', reason: `active_transaction_listing_${listing.status || 'unknown'}` };
    return { severity: 'expected', reason: 'active_transaction_lock' };
  }
  if (status === 'completed') {
    const bilateral = Boolean(transaction.buyer_confirmed_at) && Boolean(transaction.seller_confirmed_at);
    if (bilateral && listing.status === 'sold_out') return { severity: 'critical', reason: 'terminal_completed_lock_residue' };
    return { severity: 'critical', reason: 'completed_transaction_inconsistent' };
  }
  if (['cancelled', 'expired', 'no_show'].includes(status)) return { severity: 'critical', reason: `terminal_${status}_lock_residue` };
  return { severity: 'critical', reason: `unknown_transaction_status_${status || 'missing'}` };
}

const locks = await queryLocks();
const rows = [];
for (const lock of locks) {
  const [transaction, listing] = await Promise.all([
    getDoc(`transactions_v2/${lock.transaction_id}`),
    getDoc(`listings_v2/${lock.listing_id}`),
  ]);
  const classification = classifyReservationLockResidue(lock, transaction, listing);
  rows.push({
    lock_id: lock.id,
    transaction_id: lock.transaction_id || 'missing',
    listing_id: lock.listing_id || 'missing',
    transaction_status: transaction?.status || 'missing',
    listing_status: listing?.status || 'missing',
    ...classification,
  });
}

const critical = rows.filter((row) => row.severity === 'critical');
console.log(`Reservation lock residue audit · ${projectId}`);
console.log(`locks=${rows.length} expected=${rows.length - critical.length} critical=${critical.length}`);
if (critical.length) console.table(critical);
else console.log('PASS no quedaron reservation locks huérfanos, terminales o inconsistentes tras maintenance.');

if (critical.length) {
  console.error('DETENIDO: residue audit detectó locks ambiguos/terminales. No se borran automáticamente; mantener fail-closed hasta corregir la causa raíz.');
  process.exit(2);
}
