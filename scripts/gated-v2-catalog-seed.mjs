import { spawnSync } from 'node:child_process';
import { assertStagingFreezeContext } from './staging-freeze-guard.mjs';

assertStagingFreezeContext({
  allowEnv: 'TUTOP_ALLOW_V2_SEED',
  allowValue: 'staging-v2',
});

const result = spawnSync(process.execPath, ['scripts/seed-v2-catalog.mjs', '--apply'], {
  stdio: 'inherit',
  shell: false,
  env: process.env,
});
process.exit(result.status ?? 1);
