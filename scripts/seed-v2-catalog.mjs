import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

if (process.env.TUTOP_NODE_TS_STRIP !== '1') {
  const result = spawnSync(process.execPath, ['--experimental-strip-types', fileURLToPath(import.meta.url), ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: { ...process.env, TUTOP_NODE_TS_STRIP: '1', NODE_NO_WARNINGS: '1' },
  });
  process.exit(result.status ?? 1);
}

const network = await import(`${pathToFileURL(path.resolve('src/lib/universityNetwork.ts')).href}?seed=${Date.now()}`);
const apply = process.argv.includes('--apply');
const projectId = String(process.env.TUTOP_FIREBASE_PROJECT_ID || '').trim();
const allow = String(process.env.TUTOP_ALLOW_V2_SEED || '').trim();

const normalizeDomainId = (domain) => domain.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const compact = (value) => Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));

const docs = [];
for (const institution of network.INSTITUTIONS) {
  docs.push({ collection: 'institutions', id: institution.id, data: compact({ ...institution }) });
  for (const domain of institution.domains || []) {
    docs.push({
      collection: 'institution_domains',
      id: normalizeDomainId(domain),
      data: { domain: domain.toLowerCase(), institution_id: institution.id, active: institution.active !== false },
    });
  }
}
for (const campus of network.CAMPUSES) docs.push({ collection: 'campuses', id: campus.id, data: compact({ ...campus }) });
for (const faculty of network.FACULTIES) {
  const { careers = [], ...facultyData } = faculty;
  docs.push({ collection: 'faculties', id: faculty.id, data: compact(facultyData) });
  for (const career of careers) {
    docs.push({
      collection: 'careers',
      id: career.id,
      data: compact({ ...career, institution_id: faculty.institution_id, campus_id: faculty.campus_id, faculty_id: faculty.id, active: true }),
    });
  }
}
for (const point of network.SAFE_MEETING_POINTS) docs.push({ collection: 'approved_meeting_points', id: point.id, data: compact({ ...point }) });

const duplicateKeys = docs.map((item) => `${item.collection}/${item.id}`).filter((key, index, all) => all.indexOf(key) !== index);
if (duplicateKeys.length) {
  console.error(`DETENIDO: IDs duplicados en catálogo V2: ${duplicateKeys.join(', ')}`);
  process.exit(2);
}

const counts = docs.reduce((acc, item) => ({ ...acc, [item.collection]: (acc[item.collection] || 0) + 1 }), {});
console.log('TuTop Firestore V2 catalog plan');
console.table(counts);
console.log(`Total: ${docs.length} documentos`);

if (!apply) {
  console.log('\nDRY RUN: no se escribió nada.');
  console.log('Para sembrar un proyecto beta/staging:');
  console.log('  TUTOP_FIREBASE_PROJECT_ID=<id> TUTOP_ALLOW_V2_SEED=staging npm run v2:catalog:seed');
  process.exit(0);
}

if (!projectId) {
  console.error('DETENIDO: falta TUTOP_FIREBASE_PROJECT_ID.');
  process.exit(2);
}
if (allow !== 'staging') {
  console.error('DETENIDO: define TUTOP_ALLOW_V2_SEED=staging después de revisar el project ID.');
  process.exit(2);
}
if (/prod(uction)?/i.test(projectId) && process.env.TUTOP_ALLOW_PRODUCTION_FIREBASE !== '1') {
  console.error('DETENIDO: el project ID parece producción. El seed automático está limitado a beta/staging.');
  process.exit(2);
}

function accessToken() {
  const explicit = String(process.env.TUTOP_FIREBASE_ACCESS_TOKEN || '').trim();
  if (explicit) return explicit;
  const result = spawnSync('gcloud', ['auth', 'print-access-token'], { encoding: 'utf8', shell: process.platform === 'win32' });
  if (result.status === 0 && result.stdout.trim()) return result.stdout.trim();
  console.error('DETENIDO: falta TUTOP_FIREBASE_ACCESS_TOKEN y gcloud no entregó un access token.');
  process.exit(2);
}

function firestoreValue(value) {
  if (value === null) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(firestoreValue) } };
  if (typeof value === 'object') return { mapValue: { fields: firestoreFields(value) } };
  throw new Error(`Tipo no soportado en seed: ${typeof value}`);
}

function firestoreFields(data) {
  return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, firestoreValue(value)]));
}

const token = accessToken();
const base = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents`;
let written = 0;
for (const item of docs) {
  const url = `${base}/${encodeURIComponent(item.collection)}/${encodeURIComponent(item.id)}?currentDocument.exists=false`;
  const response = await fetch(url, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: firestoreFields(item.data) }),
  });
  if (response.status === 409) {
    console.error(`DETENIDO: ${item.collection}/${item.id} ya existe. El seed es create-only y no sobrescribe catálogo.`);
    process.exit(3);
  }
  if (!response.ok) {
    const detail = await response.text();
    console.error(`ERROR ${response.status} creando ${item.collection}/${item.id}: ${detail.slice(0, 500)}`);
    process.exit(1);
  }
  written += 1;
  console.log(`✓ ${item.collection}/${item.id}`);
}

console.log(`\n✅ Seed V2 completado: ${written}/${docs.length} documentos creados en ${projectId}.`);
console.log('VITE_TUTOP_SCHEMA_V2 sigue siendo una activación separada; este script no cambia feature flags ni reglas desplegadas.');
