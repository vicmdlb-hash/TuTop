import { spawnSync } from 'node:child_process';

function run(script, args = []) {
  const result = spawnSync(process.execPath, [script, ...args], {
    stdio: 'inherit',
    env: process.env,
  });
  if (result.status !== 0) process.exit(result.status || 1);
}

const args = process.argv.slice(2);
run('scripts/trusted-reputation-capacity-guard.mjs', args);
run('scripts/v2-trusted-maintenance.mjs', args);
