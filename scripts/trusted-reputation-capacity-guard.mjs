import { firebaseCiAccessToken } from './firebase-ci-auth.mjs';

const projectId = String(process.env.TUTOP_FIREBASE_PROJECT_ID || '').trim();
const historicalProject = 'tutop-3a4f7';
const limit = Math.max(1, Math.min(500, Number(process.env.TUTOP_V2_MAINTENANCE_LIMIT || 300)));

function stop(message) {
  console.error(`DETENIDO: ${message}`);
  process.exit(43);
}

if (!projectId) stop('falta TUTOP_FIREBASE_PROJECT_ID.');
if (projectId === historicalProject) stop(`${historicalProject} está bloqueado para guard de reputación V2.`);
if (/prod(uction)?/i.test(projectId) && process.env.TUTOP_ALLOW_PRODUCTION_FIREBASE !== '1') stop('el project ID parece producción.');
if (!/(staging|stage|beta|dev|test|sandbox)/i.test(projectId) && process.env.TUTOP_ALLOW_NONDESCRIPTIVE_STAGING_ID !== '1') stop('el project ID no parece staging/beta/dev/test.');

const token = await firebaseCiAccessToken();
const endpoint = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents:runAggregationQuery`;

async function countCollection(collectionId) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      structuredAggregationQuery: {
        structuredQuery: { from: [{ collectionId }] },
        aggregations: [{ alias: 'count', count: {} }],
      },
    }),
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!response.ok) stop(`COUNT ${collectionId} falló (${response.status}): ${text.slice(0, 400)}`);
  const rows = Array.isArray(data) ? data : [];
  const raw = rows.find((row) => row?.result?.aggregateFields?.count)?.result?.aggregateFields?.count;
  const value = Number(raw?.integerValue ?? raw?.doubleValue ?? NaN);
  if (!Number.isFinite(value) || value < 0) stop(`COUNT ${collectionId} devolvió un valor inválido.`);
  return Math.trunc(value);
}

const sources = ['transactions_v2', 'reviews', 'moderation_cases'];
const counts = Object.fromEntries(await Promise.all(sources.map(async (collection) => [collection, await countCollection(collection)])));
const oversized = Object.entries(counts).filter(([, count]) => count > limit);

console.log(`trusted reputation capacity: limit=${limit} ${Object.entries(counts).map(([name, count]) => `${name}=${count}`).join(' ')}`);

if (oversized.length) {
  stop(`reputación trusted podría truncarse: ${oversized.map(([name, count]) => `${name}=${count}>${limit}`).join(', ')}. Implementa paginación completa o aumenta el límite de forma deliberada antes de persistir snapshots.`);
}

console.log('PASS trusted reputation inputs fit within the configured maintenance query limit.');
