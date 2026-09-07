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
  [process.execPath, ['scripts/actions-budget-policy-tests.mjs']],
  [process.execPath, ['scripts/local-topi-favorites-tests.mjs']],
  [process.execPath, ['--experimental-strip-types', 'scripts/chat-message-idempotency-tests.mjs']],
  [process.execPath, ['--experimental-strip-types', 'scripts/offer-idempotency-tests.mjs']],
  [process.execPath, ['--experimental-strip-types', 'scripts/transaction-retry-idempotency-tests.mjs']],
  [process.execPath, ['--experimental-strip-types', 'scripts/firebase-session-hardening-tests.mjs']],
  [process.execPath, ['scripts/offline-reconnect-chaos-tests.mjs']],
  [process.execPath, ['scripts/offline-reconnect-extreme-tests.mjs']],
  [process.execPath, ['scripts/reservation-lock-residue-audit-tests.mjs']],
  [process.execPath, ['scripts/recovery-local-provider-simulation-tests.mjs']],
  [process.execPath, ['scripts/recovery-local-provider-abuse-tests.mjs']],
  [process.execPath, ['scripts/physical-qa-regression-tests.mjs']],
  [process.execPath, ['--experimental-strip-types', 'scripts/physical-qa-evidence-bundle-tests.mjs']],
  [process.execPath, ['--experimental-strip-types', 'scripts/physical-qa-two-device-gate-tests.mjs']],
  [process.execPath, ['scripts/physical-qa-readiness-pack-tests.mjs']],
  [process.execPath, ['scripts/fcm-physical-fixture-tests.mjs']],
  [process.execPath, ['scripts/app-check-enforcement-tests.mjs']],
  [process.execPath, ['scripts/physical-qa-candidate-drift-tests.mjs']],
  [process.execPath, ['scripts/physical-qa-candidate-drift.mjs']],
  [process.execPath, ['scripts/legal-retention-dossier-tests.mjs']],
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
