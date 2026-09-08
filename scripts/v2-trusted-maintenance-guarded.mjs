import { spawnSync } from 'node:child_process';

const defaultTasks = ['outcomes', 'reputation', 'credentials', 'saved-searches', 'push'];
const rawArgs = process.argv.slice(2);
const tasksArg = rawArgs.find((value) => value.startsWith('--tasks='));
const selectedTasks = (tasksArg ? tasksArg.split('=')[1].split(',') : defaultTasks).map((value) => value.trim()).filter(Boolean);
const sharedArgs = rawArgs.filter((value) => !value.startsWith('--tasks='));

function run(script, args = []) {
  const result = spawnSync(process.execPath, [script, ...args], {
    stdio: 'inherit',
    env: process.env,
  });
  if (result.status !== 0) return result.status || 1;
  return 0;
}

const blocked = [];
for (const task of selectedTasks) {
  const taskArg = `--tasks=${task}`;
  const guardStatus = run('scripts/trusted-reputation-capacity-guard.mjs', [...sharedArgs, taskArg]);
  if (guardStatus !== 0) {
    blocked.push(task);
    console.error(`SKIP trusted maintenance task '${task}': capacity guard failed.`);
    continue;
  }
  const maintenanceStatus = run('scripts/v2-trusted-maintenance.mjs', [...sharedArgs, taskArg]);
  if (maintenanceStatus !== 0) process.exit(maintenanceStatus);
}

if (blocked.length) {
  console.error(`DETENIDO PARCIAL: ${blocked.join(', ')} no se ejecutaron por capacity guard. Las demás tareas seguras sí pudieron continuar.`);
  process.exit(43);
}
