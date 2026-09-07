import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
const steps = [
  [process.execPath, ['scripts/preflight.mjs']],
  [process.execPath, ['scripts/syntax-check.mjs']],
  [process.execPath, ['scripts/logic-tests.mjs']],
  [process.execPath, ['scripts/marketplace-core-tests.mjs']],
  [process.execPath, ['scripts/schema-v2-tests.mjs']],
  [process.execPath, ['scripts/functions-domain-tests.mjs']],
  [process.execPath, ['scripts/security-tests.mjs']],
  [process.execPath, ['scripts/policy-scan.mjs']],
  [process.execPath, ['--experimental-strip-types', 'scripts/chat-message-idempotency-tests.mjs']],
  [process.execPath, ['--experimental-strip-types', 'scripts/offer-idempotency-tests.mjs']],
  [process.execPath, ['--experimental-strip-types', 'scripts/transaction-retry-idempotency-tests.mjs']],
  [process.execPath, ['--experimental-strip-types', 'scripts/firebase-session-hardening-tests.mjs']],
  [process.execPath, ['scripts/reservation-lock-residue-audit-tests.mjs']],
  [process.execPath, ['scripts/physical-qa-regression-tests.mjs']],
];
for (const file of fs.readdirSync('scripts').filter((name) => name.endsWith('.mjs')).sort()) {
  steps.unshift([process.execPath, ['--check', `scripts/${file}`]]);
}
for (const [command, args] of steps) {
  console.log(`\n==> ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, { stdio: 'inherit', shell: false });
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log('\n✅ TuTop local check PASS (no sustituye build npm/Android/Firebase emulator).');
