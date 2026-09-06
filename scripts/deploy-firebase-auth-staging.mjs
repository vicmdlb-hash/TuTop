import { spawnSync } from 'node:child_process';

const projectId = String(process.env.TUTOP_FIREBASE_PROJECT_ID || '').trim();
const allow = String(process.env.TUTOP_ALLOW_FIREBASE_DEPLOY || '').trim();
const historicalProject = 'tutop-3a4f7';
const firebaseTools = 'firebase-tools@15.29.0';

function stop(message) {
  console.error(`DETENIDO: ${message}`);
  process.exit(2);
}

if (!projectId) stop('falta TUTOP_FIREBASE_PROJECT_ID.');
if (allow !== 'staging-v2') stop('define TUTOP_ALLOW_FIREBASE_DEPLOY=staging-v2 para Auth staging.');
if (projectId === historicalProject) stop(`${historicalProject} está bloqueado para staging V2.`);
if (/prod(uction)?/i.test(projectId) && process.env.TUTOP_ALLOW_PRODUCTION_FIREBASE !== '1') stop('el project ID parece producción.');
if (!/(staging|stage|beta|dev|test|sandbox)/i.test(projectId) && process.env.TUTOP_ALLOW_NONDESCRIPTIVE_STAGING_ID !== '1') {
  stop('el project ID no parece staging/beta/dev/test.');
}

const result = spawnSync('npx', [
  '--yes', firebaseTools,
  'deploy',
  '--config', 'firebase.v2.json',
  '--project', projectId,
  '--only', 'auth',
], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: process.env,
});

if (result.status !== 0) process.exit(result.status || 1);
console.log(`✅ Firebase Authentication base (Email/Password) desplegado en ${projectId}.`);
console.log(`Firebase CLI efímero y fijado: ${firebaseTools}.`);
console.log('No se solicita upgrade a Identity Platform y no se cambia el plan de facturación.');
