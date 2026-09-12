import { spawnSync } from 'node:child_process';
import { assertStagingFreezeContext } from './staging-freeze-guard.mjs';

const args = process.argv.slice(2);
const apply = args.includes('--apply');

if (apply) {
  assertStagingFreezeContext({
    allowEnv: 'TUTOP_ALLOW_V2_RECONCILE',
    allowValue: 'staging-v2',
    requireStagingGate: true,
  });
}

const result = spawnSync(process.execPath, ['scripts/reconcile-v2-reservations.mjs', ...args], {
  stdio: 'inherit',
  shell: false,
  env: process.env,
});
process.exit(result.status ?? 1);
