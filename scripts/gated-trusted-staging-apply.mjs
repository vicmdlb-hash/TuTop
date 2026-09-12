import { spawnSync } from 'node:child_process';
import { assertStagingFreezeContext } from './staging-freeze-guard.mjs';

assertStagingFreezeContext({ requireStagingGate: true });

const task = String(process.argv[2] || '').trim();
const commands = {
  reconcile: ['scripts/reconcile-v2-reservations.mjs', '--apply'],
  maintenance: ['scripts/v2-trusted-maintenance-guarded.mjs', '--apply'],
  observability: ['scripts/v2-observability-snapshot.mjs', '--apply'],
};
const args = commands[task];
if (!args) {
  console.error(`DETENIDO: trusted apply task no permitido: ${task || 'missing'}`);
  process.exit(2);
}

const result = spawnSync(process.execPath, args, {
  stdio: 'inherit',
  shell: false,
  env: process.env,
});
process.exit(result.status ?? 1);
