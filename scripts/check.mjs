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
  [process.execPath, ['scripts/ci-auth-redaction-contract-tests.mjs']],
  [process.execPath, ['scripts/ci-auth-readiness-tests.mjs']],
  [process.execPath, ['scripts/ci-auth-parallel-workflow-tests.mjs']],
  [process.execPath, ['scripts/policy-scan.mjs']],
  [process.execPath, ['scripts/actions-budget-policy-tests.mjs']],
  [process.execPath, ['scripts/local-topi-favorites-tests.mjs']],
  [process.execPath, ['scripts/nearby-topi-091-contract-tests.mjs']],
  [process.execPath, ['scripts/firestore-cost-geography-tests.mjs']],
  [process.execPath, ['scripts/seller-profile-cache-tests.mjs']],
  [process.execPath, ['scripts/canonical-offer-read-cache-tests.mjs']],
  [process.execPath, ['scripts/offer-backend-drift-audit.mjs']],
  [process.execPath, ['scripts/transaction-bridge-fresh-offer-tests.mjs']],
  [process.execPath, ['scripts/profile-editor-v2-contract-tests.mjs']],
  [process.execPath, ['scripts/v2-canonical-listing-id-contract-tests.mjs']],
  [process.execPath, ['scripts/v2-canonical-completion-contract-tests.mjs']],
  [process.execPath, ['scripts/v2-terminal-state-authority-tests.mjs']],
  [process.execPath, ['scripts/v2-rules-composition-contract-tests.mjs']],
  [process.execPath, ['scripts/v2-rules-access-budget-tests.mjs']],
  [process.execPath, ['scripts/v2-canonical-bridge-coverage-tests.mjs']],
  [process.execPath, ['scripts/runtime-freeze-promotion-contract-tests.mjs']],
  [process.execPath, ['scripts/secondary-workflow-freeze-contract-tests.mjs']],
  [process.execPath, ['scripts/staging-mutation-surface-contract-tests.mjs']],
  [process.execPath, ['scripts/v2-snapshot-cost-audit.mjs']],
  [process.execPath, ['scripts/v2-snapshot-budget-tests.mjs']],
  [process.execPath, ['scripts/v2-cost-cutover-flags-tests.mjs']],
  [process.execPath, ['scripts/visible-favorites-cutover-tests.mjs']],
  [process.execPath, ['scripts/wallet-lazy-history-readiness-tests.mjs']],
  [process.execPath, ['scripts/trusted-public-reputation-tests.mjs']],
  [process.execPath, ['scripts/review-lazy-status-contract-tests.mjs']],
  [process.execPath, ['scripts/review-strike-cutover-readiness-tests.mjs']],
  [process.execPath, ['scripts/review-strike-emulator-gate-contract-tests.mjs']],
  [process.execPath, ['scripts/chat-lazy-history-contract-tests.mjs']],
  [process.execPath, ['scripts/v2-lean-chat-snapshot-tests.mjs']],
  [process.execPath, ['scripts/unread-aggregation-migration-tests.mjs']],
  [process.execPath, ['scripts/unread-emulator-gate-contract-tests.mjs']],
  [process.execPath, ['scripts/v2-chat-post-send-stability-tests.mjs']],
  [process.execPath, ['scripts/october-static-readiness-tests.mjs']],
  [process.execPath, ['scripts/firestore-static-contract-tests.mjs']],
  [process.execPath, ['scripts/offer-expiry-contract-tests.mjs']],
  [process.execPath, ['scripts/demand-budget-contract-tests.mjs']],
  [process.execPath, ['scripts/inbox-pending-filter-tests.mjs']],
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
  [process.execPath, ['scripts/physical-qa-candidate-generation-tests.mjs']],
  [process.execPath, ['scripts/physical-qa-candidate-drift.mjs', '--prebuild']],
  [process.execPath, ['scripts/legal-retention-dossier-tests.mjs']],
];
for (const file of fs.readdirSync('scripts').filter((name) => name.endsWith('.mjs')).sort()) {
  steps.unshift([process.execPath, ['--check', `scripts/${file}`]]);
}

const failures = [];
for (const [command, args] of steps) {
  console.log(`\n==> ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, { stdio: 'inherit', shell: false });
  if (result.status !== 0) {
    failures.push({ command, args, status: result.status ?? 1, signal: result.signal ?? null });
    console.error(`\n[COLLECTED FAILURE ${failures.length}] ${command} ${args.join(' ')} (exit ${result.status ?? 1})`);
  }
}

if (failures.length > 0) {
  console.error(`\n❌ TuTop local check found ${failures.length} failing step(s). All remaining static checks were still executed so they can be repaired in one batch.`);
  for (const [index, failure] of failures.entries()) {
    console.error(`${index + 1}. exit=${failure.status} ${failure.command} ${failure.args.join(' ')}`);
  }
  process.exit(1);
}

console.log('\n✅ TuTop local check PASS (no sustituye build npm/Android/Firebase emulator).');
