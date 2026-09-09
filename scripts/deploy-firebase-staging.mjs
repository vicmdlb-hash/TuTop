import { spawnSync } from 'node:child_process';
import { assertStagingFreezeContext } from './staging-freeze-guard.mjs';

const project = assertStagingFreezeContext({
  allowEnv: 'TUTOP_ALLOW_FIREBASE_DEPLOY',
  allowValue: 'staging-v2',
});
const firebaseTools = 'firebase-tools@15.29.0';
const isWindows = process.platform === 'win32';

const run = (command, args) => {
  console.log(`\n> ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, { stdio: 'inherit', shell: isWindows, env: process.env });
  if (result.status !== 0) process.exit(result.status || 1);
};

console.log(`TuTop V2 staging deploy target: ${project}`);
console.log(`October gate run: ${process.env.TUTOP_VALIDATED_GATE_RUN_ID}`);
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
