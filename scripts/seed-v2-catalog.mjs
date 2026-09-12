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

const network = await import(`${pathToFileURL(path.resolve('src/lib/universityNetwork.ts')).href}?seed=${Date.now()}`);
const apply = process.argv.includes('--apply');
const projectId = String(process.env.TUTOP_FIREBASE_PROJECT_ID || '').trim();
const allow = String(process.env.TUTOP_ALLOW_V2_SEED || '').trim();
const historicalProject = 'tutop-3a4f7';

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
  console.log('Para sembrar o verificar un proyecto beta/staging V2:');
  console.log('  TUTOP_FIREBASE_PROJECT_ID=<id> TUTOP_ALLOW_V2_SEED=staging-v2 npm run v2:catalog:seed');
  process.exit(0);
}

if (!projectId) {
  console.error('DETENIDO: falta TUTOP_FIREBASE_PROJECT_ID.');
  process.exit(2);
}
if (allow !== 'staging-v2') {
  console.error('DETENIDO: define TUTOP_ALLOW_V2_SEED=staging-v2 después de revisar el project ID.');
  process.exit(2);
}
if (projectId === historicalProject) {
  console.error(`DETENIDO: ${historicalProject} es el proyecto histórico de TuTop y no puede usarse para el seed V2.`);
  process.exit(2);
}
if (/prod(uction)?/i.test(projectId) && process.env.TUTOP_ALLOW_PRODUCTION_FIREBASE !== '1') {
  console.error('DETENIDO: el project ID parece producción. El seed automático está limitado a beta/staging V2.');
  process.exit(2);
}
if (!/(staging|stage|beta|dev|test|sandbox)/i.test(projectId) && process.env.TUTOP_ALLOW_NONDESCRIPTIVE_STAGING_ID !== '1') {
  console.error('DETENIDO: el project ID no parece un entorno staging/beta/dev/test. Usa un ID inequívoco o define TUTOP_ALLOW_NONDESCRIPTIVE_STAGING_ID=1 tras revisión manual.');
  process.exit(2);
}

async function accessToken() {
  const explicit = String(process.env.TUTOP_FIREBASE_ACCESS_TOKEN || '').trim();
  if (explicit) return explicit;
  const result = spawnSync('gcloud', ['auth', 'print-access-token'], { encoding: 'utf8', shell: process.platform === 'win32' });
  if (result.status === 0 && result.stdout.trim()) return result.stdout.trim();
  try {
    return await firebaseCiAccessToken();
  } catch (error) {
    console.error(`DETENIDO: no se pudo obtener access token para el seed V2: ${error.message}`);
    process.exit(2);
  }
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

function decodeValue(value = {}) {
  if ('nullValue' in value) return null;
  if ('stringValue' in value) return value.stringValue;
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

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

function sameData(actual, expected) {
  return JSON.stringify(stable(actual)) === JSON.stringify(stable(expected));
}

async function verifyExistingCatalog(token) {
  const base = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents`;
  const failures = [];
  for (const item of docs) {
    const response = await fetch(`${base}/${encodeURIComponent(item.collection)}/${encodeURIComponent(item.id)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      failures.push(`${item.collection}/${item.id}:HTTP_${response.status}`);
      continue;
    }
    const remote = await response.json();
    const actual = decodeFields(remote.fields || {});
    if (!sameData(actual, item.data)) failures.push(`${item.collection}/${item.id}:DATA_MISMATCH`);
  }
  if (failures.length) {
    console.error(`DETENIDO: el catálogo remoto ya existe pero no coincide con la fuente (${failures.length} problema(s)).`);
    console.error(failures.slice(0, 12).join('\n'));
    process.exit(4);
  }
  console.log(`\n✅ Catálogo V2 ya existente verificado: ${docs.length}/${docs.length} documentos coinciden. No se sobrescribió nada.`);
}

const token = await accessToken();
const projectPath = `projects/${projectId}/databases/(default)/documents`;
const writes = docs.map((item) => ({
  update: {
    name: `${projectPath}/${item.collection}/${item.id}`,
    fields: firestoreFields(item.data),
  },
  currentDocument: { exists: false },
}));
const endpoint = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents:commit`;
const response = await fetch(endpoint, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ writes }),
});
if (!response.ok) {
  const detail = await response.text();
  if (response.status === 409 || /already exists|FAILED_PRECONDITION/i.test(detail)) {
    console.log('\nCatálogo V2 detectado previamente. Verificando integridad sin sobrescribir...');
    await verifyExistingCatalog(token);
    console.log('VITE_TUTOP_SCHEMA_V2 sigue siendo una activación separada; este script no cambia feature flags ni reglas desplegadas.');
    process.exit(0);
  }
  console.error(`DETENIDO: el commit atómico no escribió ningún documento. Firestore respondió ${response.status}: ${detail.slice(0, 1000)}`);
  process.exit(1);
}
const result = await response.json();
if (!Array.isArray(result.writeResults) || result.writeResults.length !== docs.length) {
  console.error(`ERROR: Firestore confirmó ${result.writeResults?.length || 0}/${docs.length} escrituras; revisa el proyecto antes de activar V2.`);
  process.exit(1);
}

console.log(`\n✅ Seed V2 atómico completado: ${docs.length} documentos creados en ${projectId}.`);
console.log('VITE_TUTOP_SCHEMA_V2 sigue siendo una activación separada; este script no cambia feature flags ni reglas desplegadas.');
