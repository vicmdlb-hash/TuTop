import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const exists = (p) => fs.existsSync(path.join(root, p));
const project = JSON.parse(fs.readFileSync(path.join(root, 'config/project.json'), 'utf8'));
const rows = [];
const push = (name, status, detail) => rows.push({ name, status, detail });

push('Application ID', project.applicationIdConfirmed === true ? 'READY' : 'BLOCKED', project.applicationId);
push('GitHub source repo', 'HUMAN', 'autorizar/conectar vicmdlb-hash/TuTop cuando el conector lo vea');
push('GitHub APK CI', exists('.github/workflows/android-debug-apk.yml') ? 'READY' : 'BLOCKED', 'workflow debug, API 36, sin Play Console');
push('Firebase project', exists('.firebaserc') ? 'READY' : 'HUMAN', exists('.firebaserc') ? '.firebaserc presente' : 'crear proyecto Spark y elegir projectId');
push('Firebase Web config', exists('.env.local') ? 'CHECK' : 'HUMAN', exists('.env.local') ? '.env.local presente' : 'registrar app Web o pegar firebaseConfig en runtime');
push('Auth Email/Password', 'HUMAN', 'habilitar proveedor en Firebase Console; el teléfono beta NO se verifica por SMS');
push('Cloud Firestore', 'HUMAN', 'crear base y desplegar rules/indexes Spark');
push('Bootstrap admin', 'HUMAN', 'crear una sola vez admins/{uid}.active=true desde Firestore Console');
push('Google Play Console', 'DEFER', 'no se necesita para la APK debug ni para la beta cero inversión');
push('Cloud Storage/Functions', 'DEFER', 'bloqueados mientras zeroInvestmentMode=true y billingAllowed=false');

console.log('TuTop external readiness · Spark / cero inversión');
console.log('================================================');
for (const row of rows) console.log(`${row.status.padEnd(7)} ${row.name.padEnd(24)} ${row.detail}`);
console.log('\nLeyenda: HUMAN = paso externo del propietario; CHECK = validar; READY = preparado; DEFER = pospuesto deliberadamente.');
