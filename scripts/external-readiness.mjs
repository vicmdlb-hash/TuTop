import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const exists = (p) => fs.existsSync(path.join(root, p));
const project = JSON.parse(fs.readFileSync(path.join(root, 'config/project.json'), 'utf8'));
const freeze = JSON.parse(fs.readFileSync(path.join(root, 'docs/RUNTIME_FREEZE_CANDIDATE_0.9.json'), 'utf8'));
const rows = [];
const push = (name, status, detail) => rows.push({ name, status, detail });
const stagingProject = 'tutop-beta-vicmdlb-1356585881';

push('Application ID', project.applicationIdConfirmed === true && project.applicationId === 'mx.tutop.app' ? 'PREPARED' : 'BLOCKED', project.applicationId || 'missing');
push('GitHub source repo', 'READY', 'vicmdlb-hash/TuTop · PR #6 · rama feat/tutop-0.8-p0');
push('Runtime Freeze', freeze.status === 'runtime_freeze_candidate' && freeze.runtime_validated === false ? 'PREPARED' : 'BLOCKED', 'NOT VALIDATED hasta October → Staging → Android same-SHA');
push('GitHub Actions', exists('.github/workflows/october-01-validation.yml') && exists('.github/workflows/staging-v2-smoke.yml') && exists('.github/workflows/android-debug-apk.yml') ? 'PREPARED' : 'BLOCKED', 'manual-only; no ejecutar fuera de la cadena exact-branch/exact-SHA');
push('Managed OAuth secrets', 'HUMAN', 'rotar/configurar FIREBASE_OAUTH_CLIENT_ID + FIREBASE_OAUTH_CLIENT_SECRET en GitHub Secrets; no imprimir valores');
push('Firebase staging', 'PREPARED', `${stagingProject} · .firebaserc NO es autoridad de staging`);
push('Firebase Web config', 'GATED', 'se genera temporalmente por staging sólo después de October green same-branch/same-SHA');
push('Firebase Android config', 'GATED', 'se genera/valida para mx.tutop.app dentro de la cadena autorizada');
push('Auth Email/Password', 'GATED', 'staging lo configura sin Identity Platform upgrade después del gate exact-SHA');
push('Firestore Rules/indexes', 'GATED', 'deploy staging + prueba real read-only de índices compuestos antes del E2E');
push('App Check', 'PREPARED', 'OFF/UNENFORCED durante Runtime Freeze; ENFORCED bloqueado');
push('Current APK', 'BLOCKED', 'NONE hasta October + Staging + Android sobre el mismo SHA');
push('Physical QA A+B', 'HUMAN', 'requiere instalación/observación física del APK exact-head; no sintetizar evidencia');
push('Google Play / billing', 'DEFER', 'bloqueados: zeroInvestmentMode=true, billingAllowed=false, productionPublishingAllowed=false');
push('Production / main merge', 'DEFER', 'fuera del Runtime Freeze Candidate y sin autorización explícita');

console.log('TuTop external readiness · Runtime Freeze Candidate');
console.log('====================================================');
for (const row of rows) console.log(`${row.status.padEnd(8)} ${row.name.padEnd(25)} ${row.detail}`);
console.log('\nLeyenda: READY=acceso confirmado; PREPARED=configuración estática lista; GATED=depende de cadena exact-SHA; HUMAN=acción externa inevitable; BLOCKED=no avanzar; DEFER=deliberadamente fuera de alcance.');
