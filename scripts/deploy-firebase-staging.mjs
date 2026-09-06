import { spawnSync } from 'node:child_process';

const project = String(process.env.TUTOP_FIREBASE_PROJECT_ID || '').trim();
const allow = String(process.env.TUTOP_ALLOW_FIREBASE_DEPLOY || '').trim();
const historicalProject = 'tutop-3a4f7';
const firebaseTools = 'firebase-tools@15.29.0';

function stop(message) {
  console.error(`DETENIDO: ${message}`);
  process.exit(2);
}

if (!project) stop('falta TUTOP_FIREBASE_PROJECT_ID. Usa un proyecto Firebase dedicado exclusivamente a beta/staging.');
if (allow !== 'staging-v2') stop('define TUTOP_ALLOW_FIREBASE_DEPLOY=staging-v2 sólo después de verificar el project ID.');
if (project === historicalProject) stop(`${historicalProject} es el proyecto histórico de TuTop y no puede usarse para esta prueba V2.`);
if (/prod(uction)?/i.test(project) && process.env.TUTOP_ALLOW_PRODUCTION_FIREBASE !== '1') stop('el project ID parece producción. Este comando es sólo para staging/beta V2.');
if (!/(staging|stage|beta|dev|test|sandbox)/i.test(project) && process.env.TUTOP_ALLOW_NONDESCRIPTIVE_STAGING_ID !== '1') {
  stop('el project ID no parece un entorno staging/beta/dev/test. Usa un ID inequívoco o define TUTOP_ALLOW_NONDESCRIPTIVE_STAGING_ID=1 tras revisión manual.');
}

const isWindows = process.platform === 'win32';
const run = (command, args) => {
  console.log(`\n> ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, { stdio: 'inherit', shell: isWindows, env: process.env });
  if (result.status !== 0) process.exit(result.status || 1);
};

console.log(`TuTop V2 staging deploy target: ${project}`);
console.log('Config: firebase.v2.json');
console.log('Rules: firebase/firestore.v2.generated.rules (generadas antes de deploy)');
console.log('Scope: firestore:rules,firestore:indexes únicamente');

run('npm', ['run', 'check']);
run('npm', ['run', 'typecheck']);
run('npm', ['run', 'v2:rules:prepare']);
run('npm', ['run', 'v2:catalog:plan']);
run('npx', [
  '--yes', firebaseTools,
  'deploy',
  '--config', 'firebase.v2.json',
  '--project', project,
  '--only', 'firestore:rules,firestore:indexes',
]);

console.log(`\n✅ Firestore V2 staging desplegado en ${project}.`);
console.log(`Firebase CLI efímero y fijado: ${firebaseTools}.`);
console.log('Este comando NO despliega hosting, storage, functions ni activa VITE_TUTOP_SCHEMA_V2.');
console.log('Siguiente paso seguro: ejecutar el seed V2 controlado y validar lecturas/escrituras antes de activar la feature flag en una beta dedicada.');
