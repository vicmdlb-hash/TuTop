import { spawnSync } from 'node:child_process';
import { assertStagingFreezeContext } from './staging-freeze-guard.mjs';

const projectId = assertStagingFreezeContext({
  allowEnv: 'TUTOP_ALLOW_FIREBASE_DEPLOY',
  allowValue: 'staging-v2',
});
const firebaseTools = 'firebase-tools@15.29.0';

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
console.log(`October gate run: ${process.env.TUTOP_VALIDATED_GATE_RUN_ID}`);
console.log(`Firebase CLI efímero y fijado: ${firebaseTools}.`);
console.log('No se solicita upgrade a Identity Platform y no se cambia el plan de facturación.');
