import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
const isWindows = process.platform === 'win32';
const steps = [
  ['node', ['scripts/preflight.mjs']],
  ['node', ['scripts/syntax-check.mjs']],
  ['node', ['scripts/logic-tests.mjs']],
  ['node', ['scripts/functions-domain-tests.mjs']],
  ['node', ['scripts/security-tests.mjs']],
  ['node', ['scripts/policy-scan.mjs']],
];
for (const file of fs.readdirSync('scripts').filter((name) => name.endsWith('.mjs')).sort()) {
  steps.unshift(['node', ['--check', `scripts/${file}`]]);
}
for (const [command, args] of steps) {
  console.log(`\n==> ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, { stdio: 'inherit', shell: isWindows });
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log('\n✅ TuTop local check PASS (no sustituye build npm/Android/Firebase emulator).');
