import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { firebaseCiAccessToken } from './firebase-ci-auth.mjs';

if (process.env.TUTOP_NODE_TS_STRIP !== '1') {
  const result = spawnSync(process.execPath, ['--experimental-strip-types', fileURLToPath(import.meta.url), ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: { ...process.env, TUTOP_NODE_TS_STRIP: '1', NODE_NO_WARNINGS: '1' },
  });
  process.exit(result.status ?? 1);
}

const { reservationReconciliationPlan } = await import(`${pathToFileURL(path.resolve('src/lib/reservationReconciliation.ts')).href}?run=${Date.now()}`);

const apply = process.argv.includes('--apply');
const projectId = String(process.env.TUTOP_FIREBASE_PROJECT_ID || '').trim();
const allow = String(process.env.TUTOP_ALLOW_V2_RECONCILE || '').trim();
const historicalProject = 'tutop-3a4f7';
const maxDocs = Math.max(1, Math.min(500, Number(process.env.TUTOP_V2_RECONCILE_LIMIT || 200)));

function stop(message) {
  console.error(`DETENIDO: ${message}`);
  process.exit(2);
}

function assertStagingTarget() {
  if (!projectId) stop('falta TUTOP_FIREBASE_PROJECT_ID. Usa un proyecto dedicado a beta/staging V2.');
  if (projectId === historicalProject) stop(`${historicalProject} es el proyecto histórico de TuTop y no puede usarse para reconciliación V2.`);
  if (/prod(uction)?/i.test(projectId) && process.env.TUTOP_ALLOW_PRODUCTION_FIREBASE !== '1') stop('el project ID parece producción.');
  if (!/(staging|stage|beta|dev|test|sandbox)/i.test(projectId) && process.env.TUTOP_ALLOW_NONDESCRIPTIVE_STAGING_ID !== '1') stop('el project ID no parece staging/beta/dev/test.');
  if (apply && allow !== 'staging-v2') stop('para escribir define TUTOP_ALLOW_V2_RECONCILE=staging-v2 después de revisar el dry-run.');
}

async function accessToken() {
  const explicit = String(process.env.TUTOP_FIREBASE_ACCESS_TOKEN || '').trim();
  if (explicit) return explicit;
  const result = spawnSync('gcloud', ['auth', 'print-access-token'], { encoding: 'utf8', shell: process.platform === 'win32' });
  if (result.status === 0 && result.stdout.trim()) return result.stdout.trim();
  try { return await firebaseCiAccessToken(); }
  catch (error) { stop(`no se pudo obtener access token para reconciliación V2: ${error.message}`); }
}

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

function encodeValue(value) {
  if (value === null) return { nullValue: null };
  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}T/.test(value)) return { timestampValue: value };
    return { stringValue: value };
  }
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  throw new Error(`No se puede codificar ${typeof value}`);
}

function patchWrite(documentPath, data) {
  return {
    update: {
      name: `projects/${projectId}/databases/(default)/documents/${documentPath}`,
      fields: Object.fromEntries(Object.entries(data).map(([key, value]) => [key, encodeValue(value)])),
    },
    updateMask: { fieldPaths: Object.keys(data) },
  };
}
function deleteWrite(documentPath) {
  return { delete: `projects/${projectId}/databases/(default)/documents/${documentPath}` };
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`${response.status} ${detail.slice(0, 800)}`);
  }
  return response.status === 204 ? null : response.json();
}

assertStagingTarget();
const token = await accessToken();
const base = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents`;
const queryResponse = await requestJson(`${base}:runQuery`, {
  method: 'POST',
  body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'transactions_v2' }], limit: maxDocs } }),
});

const transactions = (queryResponse || []).filter((row) => row.document).map((row) => ({
  id: row.document.name.split('/').pop(),
  ...decodeFields(row.document.fields || {}),
}));

const plans = [];
for (const transaction of transactions) {
  if (!transaction.listing_id) continue;
  let listingStatus = 'archived';
  try {
    const listing = await requestJson(`${base}/listings_v2/${encodeURIComponent(transaction.listing_id)}`);
    listingStatus = decodeFields(listing.fields || {}).status || listingStatus;
  } catch (error) {
    plans.push({ transaction_id: transaction.id, listing_id: transaction.listing_id, kind: 'none', reason: `listing_unavailable:${error.message}` });
    continue;
  }
  const plan = reservationReconciliationPlan({ transaction, listingStatus });
  plans.push({ transaction_id: transaction.id, listing_id: transaction.listing_id, current_transaction_status: transaction.status, current_listing_status: listingStatus, ...plan });
}

const actionable = plans.filter((plan) => plan.kind !== 'none');
console.log(`TuTop V2 reservation reconciliation · ${projectId}`);
console.log(`Revisadas: ${plans.length} · Accionables: ${actionable.length} · Modo: ${apply ? 'APPLY' : 'DRY RUN'}`);
if (actionable.length) console.table(actionable);
else console.log('Sin reparaciones necesarias en la muestra revisada.');

if (!apply) {
  console.log('\nDRY RUN: no se escribió nada.');
  console.log('Para aplicar en staging V2 tras revisar la tabla:');
  console.log('TUTOP_ALLOW_V2_RECONCILE=staging-v2 npm run v2:reservations:reconcile -- --apply');
  process.exit(0);
}

let applied = 0;
for (const plan of actionable) {
  const updatedAt = new Date().toISOString();
  const writes = [];
  if (plan.kind === 'expire_reserved') {
    writes.push(patchWrite(`transactions_v2/${plan.transaction_id}`, { status: 'expired', updated_at: updatedAt }));
    writes.push(deleteWrite(`listing_reservation_locks/${plan.listing_id}`));
  } else if (plan.kind === 'repair_completed_listing') {
    writes.push(patchWrite(`listings_v2/${plan.listing_id}`, { status: 'sold_out', updated_at: updatedAt }));
    writes.push(deleteWrite(`listing_reservation_locks/${plan.listing_id}`));
  }
  if (!writes.length) continue;
  await requestJson(`${base}:commit`, { method: 'POST', body: JSON.stringify({ writes }) });
  applied += 1;
}

console.log(`\n✅ Reconciliación canonical V2 completada: ${applied} operación(es) reparada(s).`);
console.log('El worker no cambia visibilidad al reservar; expira transactions, limpia reservation locks terminales y repara sold_out tras confirmación bilateral.');
