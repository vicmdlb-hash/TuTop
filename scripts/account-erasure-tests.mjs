import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const processor = fs.readFileSync('scripts/process-account-erasure.mjs', 'utf8');
const planner = fs.readFileSync('scripts/account-erasure-planner.mjs', 'utf8');
const liveSmoke = fs.readFileSync('scripts/staging-account-erasure-smoke.mjs', 'utf8');
// Keep the processor and real staging smoke on the same completion contract.
// This is a source-only assertion: never run destructive staging smoke in npm check.
const processorNote = processor.match(/processing_note:\s*'([^']+)'/)?.[1];
const smokeNote = liveSmoke.match(/assert\.equal\(fieldString\(request,\s*'processing_note'\),\s*'([^']+)'\)/)?.[1];
assert(processorNote && smokeNote, 'erasure completion note contract must exist on both sides');
assert.equal(smokeNote, processorNote, 'smoke must expect the processor completion note');

const smokeWorkflow = fs.readFileSync('.github/workflows/staging-v2-smoke.yml', 'utf8');
const policy = fs.readFileSync('src/lib/accountErasurePolicy.ts', 'utf8');
const retentionMatrix = fs.readFileSync('docs/RETENTION_ERASURE_MATRIX_0.9.md', 'utf8');
for (const unclassified of [
  'notification_outbox', 'age_proofs_v2', 'guardian_grants_v2',
  'adult_actions_v2', 'chats/*/messages', 'chats/*/reads',
  'chats/*/confirmations', 'moderation_cases',
]) {
  assert(retentionMatrix.includes('`' + unclassified + '`'),
    'erasure review matrix must explicitly track residual class: ' + unclassified);
}
assert.match(retentionMatrix, /Inventario adicional pendiente de clasificación/);
assert.match(retentionMatrix, /no marcar el borrado como completado/);


for (const collection of ['users','user_private','notification_preferences','device_tokens','notification_receipts','favorites','saved_searches','wallets','wallet_transactions','verificationRequests','publicVerifications','reputation','moderationStatus']) {
  assert.match(policy, new RegExp(`collection: '${collection.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'.*disposition: 'delete'`), `${collection} debe eliminarse`);
}
for (const collection of ['listings_v2','demand_requests']) {
  assert.match(policy, new RegExp(`collection: '${collection}'.*disposition: 'withdraw'`), `${collection} debe retirarse`);
}
for (const collection of ['account_deletion_requests','transactions_v2','listing_reservation_locks','offers','chats','reviews','reports','audit_log']) {
  assert.match(policy, new RegExp(`collection: '${collection}'.*disposition: 'retain_operational'`), `${collection} debe tener retención operativa`);
}

const indexManifest = JSON.parse(fs.readFileSync('firebase/firestore.indexes.json','utf8'));
assert(indexManifest.fieldOverrides.some(item => item.collectionGroup === 'targets' && item.fieldPath === 'blocked_uid' && item.indexes.some(index => index.queryScope === 'COLLECTION_GROUP')), 'incoming private block query needs collection-group index');
assert.match(policy, /collection: 'user_blocks\/\*\/targets'.*disposition: 'delete'/);
assert.match(processor, /adminRunCollectionGroupQueryAll\('targets'/);
assert.match(processor, /ACCOUNT_ERASURE_BLOCK_EDGE_MISMATCH/);
assert.match(processor, /ACCOUNT_ERASURE_USER_BLOCK_RESIDUAL/);
assert.match(processor, /queryDeletePaths\.push\(\.\.\.blockPaths\)/);
const adminSource = fs.readFileSync('scripts/staging-v2-admin.mjs','utf8');
assert.match(adminSource, /export async function adminRunCollectionGroupQueryAll/);
assert.match(adminSource, /allDescendants: true/);
assert.match(processor, /projectId !== REQUIRED/);
assert.match(processor, /ACCOUNT_ERASURE_INVALID_UID_BEFORE_ADMIN_READ/);
assert.match(processor, /\^\[A-Za-z0-9_-\]\{8,128\}\$/);
assert(processor.indexOf('ACCOUNT_ERASURE_INVALID_UID_BEFORE_ADMIN_READ') < processor.indexOf('const request = await adminGetDocument('), 'invalid UID must be rejected before any admin read');
assert.match(processor, /ACCOUNT_ERASURE_RUN_ID_INVALID_BEFORE_ADMIN_READ/);
assert(processor.indexOf('ACCOUNT_ERASURE_RUN_ID_INVALID_BEFORE_ADMIN_READ') < processor.indexOf('const request = await adminGetDocument('), 'invalid run ID must be rejected before any admin read');

assert.match(processor, /TUTOP_ALLOW_ACCOUNT_ERASURE !== 'staging-reviewed'/);
assert.match(processor, /buildAccountErasurePlan/);
assert.match(processor, /\['listing_reservation_locks', 'buyer_id'\]/);
assert.match(processor, /\['listing_reservation_locks', 'seller_id'\]/);
assert.match(processor, /adminListDocuments/);
assert.match(processor, /for \(const nested of \['messages', 'reads', 'confirmations'\]\)/);
assert.match(processor, /collection: `chats\/\*\/\$\{nested\}`/);
assert.match(processor, /adminListDocuments\(`\$\{chatPath\}\/\$\{nested\}`, 500\)/);
assert.match(processor, /residual_manifest_version: 'staging-erasure-residual-v2'/);
assert.match(processor, /retained_count: plan\.retained_count/);
assert.match(processor, /active_marketplace_transaction/);
assert.match(processor, /reservationLocks\.set\(document\.path, document\)/);
assert.match(processor, /blockers\.push\(\.\.\.reservationLockBlockers\(\[\.\.\.reservationLocks\.values\(\)\], uid\)\)/);
assert.match(processor, /ACCOUNT_ERASURE_BLOCKED/);
assert.match(processor, /terminalStatuses = new Set\(\['completed', 'cancelled', 'expired', 'no_show'\]\)/);
assert.match(planner, /mode: apply \? 'apply' : 'dry-run'/);
assert.match(planner, /blocked: normalizedBlockers\.length > 0/);
assert.match(planner, /safe_to_execute_in_staging: false/);
assert.match(planner, /admission_freeze_verified: false/);
assert.match(processor, /if\s*\(apply\)\s*throw new Error\('ACCOUNT_ERASURE_ADMISSION_FREEZE_NOT_VERIFIED'\)/, 'apply must remain unconditionally blocked until a verified server-side admission freeze exists');
assert(processor.indexOf('ACCOUNT_ERASURE_ADMISSION_FREEZE_NOT_VERIFIED') < processor.indexOf('const request = await adminGetDocument'), 'apply gate must fail before admin reads');

assert(!processor.split('\n').some((line) => line.trimStart().startsWith('import ') && line.includes("'./staging-v2-admin.mjs'")),
  'static import would initialize Firebase admin credentials before the apply freeze');
const adminImport = processor.indexOf("await import('./staging-v2-admin.mjs')");
const admissionStop = processor.indexOf("if (apply) throw new Error('ACCOUNT_ERASURE_ADMISSION_FREEZE_NOT_VERIFIED')");
assert(adminImport > admissionStop && admissionStop >= 0,
  'admin credentials must only initialize after unconditional apply freeze');
// Evaluate just the actual processor preflight in an isolated VM: no imports,
// network, credentials, Firestore or Auth are available in this sandbox.
const processorPrelude = processor.slice(processor.indexOf('const projectId ='), processor.lastIndexOf('const { adminDeleteDocument', adminImport));
assert(processorPrelude.includes('ACCOUNT_ERASURE_ADMISSION_FREEZE_NOT_VERIFIED') && !processorPrelude.includes('await import'),
  'synthetic prelude extraction must end before credential import');
function syntheticApply({ projectId = 'tutop-beta-vicmdlb-1356585881', uid = 'syntheticUser12345', gate = 'staging-reviewed', runId = 'synthetic-run-1' } = {}) {
  return () => vm.runInNewContext(processorPrelude, {
    process: {
      env: {
        TUTOP_FIREBASE_PROJECT_ID: projectId,
        TUTOP_ALLOW_ACCOUNT_ERASURE: gate,
        TUTOP_ERASURE_RUN_ID: runId,
      },
      argv: ['node', 'scripts/process-account-erasure.mjs', '--uid', uid, '--apply'],
    },
  }, { timeout: 250 });
}
assert.throws(syntheticApply(), /ACCOUNT_ERASURE_ADMISSION_FREEZE_NOT_VERIFIED/,
  'even a valid synthetic staging gate/run ID must never allow destructive apply');
assert.throws(syntheticApply({ gate: '' }), /Apply bloqueado/,
  'missing staging authorization must be denied first');
assert.throws(syntheticApply({ uid: 'bad!' }), /ACCOUNT_ERASURE_INVALID_UID_BEFORE_ADMIN_READ/);
assert.throws(syntheticApply({ runId: '' }), /ACCOUNT_ERASURE_RUN_ID_INVALID_BEFORE_ADMIN_READ/);
assert.throws(syntheticApply({ projectId: 'other-project' }), /Account erasure sólo puede operar en staging/);

assert.match(planner, /auth_delete_last: true/);
// CI/staging logs must never reveal full UID, Firestore document paths,
// chat identifiers or transaction IDs from a real erasure plan.
assert.match(processor, /residualRiskSummary\(plan\)/);
assert.doesNotMatch(processor, /console\.log\(JSON\.stringify\(plan/);
assert.doesNotMatch(processor, /ACCOUNT_ERASURE_BLOCKED:\$\{plan\.blockers/);
assert.doesNotMatch(processor, /ACCOUNT_ERASURE_DIRECT_RESIDUAL:\$\{path\}/);
assert.doesNotMatch(processor, /Eliminación controlada staging completada para \$\{uid\}/);
assert.match(processor, /DRY-RUN: no se modificó Firestore\/Auth/);
assert.match(processor, /DRY-RUN BLOQUEADO/);
assert.match(processor, /status: 'archived'/);
assert.match(processor, /status: 'expired'/);
assert.match(processor, /await adminDeleteDocument\(`users\/\$\{uid\}`\)/);
assert.match(processor, /await adminDeleteTestUsers\(\[uid\]\)/);
assert(processor.indexOf('await adminDeleteTestUsers([uid])') > processor.indexOf('await adminDeleteDocument(`users/${uid}`)'), 'Auth debe borrarse al final');
assert.doesNotMatch(processor, /adminDeleteDocument\(`transactions_v2/);
assert.doesNotMatch(processor, /adminDeleteDocument\(`listing_reservation_locks/);
assert.doesNotMatch(processor, /adminDeleteDocument\(`chats/);
assert.doesNotMatch(processor, /adminDeleteDocument\(`reports/);

// Legacy staging destructive smoke is deliberately disabled before ANY config
// preparation, test-user creation or remote Firebase IO. Source-only contract.
// The later legacy success assertions are historical and must never run.
const legacyStop = "throw new Error('ACCOUNT_ERASURE_STAGING_SMOKE_DISABLED_UNTIL_ATOMIC_ADMISSION_FREEZE');";
assert(liveSmoke.includes(legacyStop), 'legacy staging erasure smoke must explicitly fail closed');
assert(liveSmoke.indexOf(legacyStop) < liveSmoke.indexOf('fs.existsSync(configPath)'), 'legacy smoke must fail before staging config access');
assert(liveSmoke.indexOf(legacyStop) < liveSmoke.indexOf('createUserWithEmailAndPassword(auth, email, password)'), 'legacy smoke must fail before Auth user creation');
assert(liveSmoke.indexOf(legacyStop) < liveSmoke.indexOf('await cleanup()'), 'legacy destructive cleanup must be unreachable');

assert(!liveSmoke.split('\n').some((line) => line.trimStart().startsWith('import ') && line.includes("'./staging-v2-admin.mjs'")),
  'static staging admin import would fetch a credential even when smoke is disabled');
const smokeAdminImport = liveSmoke.indexOf("await import('./staging-v2-admin.mjs')");
assert(smokeAdminImport > liveSmoke.indexOf(legacyStop) && smokeAdminImport < liveSmoke.indexOf('fs.existsSync(configPath)'),
  'legacy smoke credential initialization must stay behind the stop and before historical config');
const smokePrelude = liveSmoke.slice(liveSmoke.indexOf('const projectId ='), liveSmoke.lastIndexOf('const { adminDeleteDocument', smokeAdminImport));
assert(smokePrelude.includes(legacyStop), 'synthetic staging prelude must contain fail-closed stop');
assert.throws(() => vm.runInNewContext(smokePrelude, { process: { env: {} } }, { timeout: 250 }),
  /ACCOUNT_ERASURE_STAGING_SMOKE_DISABLED_UNTIL_ATOMIC_ADMISSION_FREEZE/,
  'legacy smoke must abort before imports, Firebase setup, user creation or cleanup');

assert.match(liveSmoke, /createUserWithEmailAndPassword/);
assert.match(liveSmoke, /account_deletion_requests/);
assert.match(liveSmoke, /process-account-erasure\.mjs', '--uid', uid, '--apply'/);
assert.match(liveSmoke, /retainedNestedPaths/);
assert.match(liveSmoke, /residual_manifest_version/);
assert.match(liveSmoke, /fieldInteger\(request, 'retained_count'\)/);
assert.match(liveSmoke, /signInWithEmailAndPassword/);
assert.match(liveSmoke, /Real staging account erasure smoke: PASS/);
assert.match(smokeWorkflow, /Real controlled account erasure smoke/);
assert.match(smokeWorkflow, /if:\s*github\.ref_name == 'feat\/tutop-0\.9\.1-nearby-topi'/, 'legacy staging workflow must not be dispatchable from the integration branch');
assert.match(smokeWorkflow, /TUTOP_ALLOW_ACCOUNT_ERASURE: staging-reviewed/);
assert.match(smokeWorkflow, /node scripts\/staging-account-erasure-smoke\.mjs/);

// Expanded dry-run residual inventory must remain read-only and fail-closed.
for (const [collection, field] of [
  ['notification_outbox', 'recipient_uid'], ['moderation_cases', 'target_id'],
]) {
  assert(processor.includes(`['${collection}', '${field}']`),
    `missing read-only residual inventory: ${collection}.${field}`);
}
for (const collection of ['age_proofs_v2', 'guardian_grants_v2', 'adult_actions_v2']) {
  assert(processor.includes(`'${collection}'`), `missing subject-keyed residual: ${collection}`);
}
assert.match(processor, /await adminGetDocument\(`\$\{collection\}\/\$\{uid\}`\)/);
assert.match(processor, /retained\.push\(\{ collection, field: 'subject_uid', count: 1 \}\)/);
for (const collection of [
  'notification_outbox', 'moderation_cases', 'age_proofs_v2',
  'guardian_grants_v2', 'adult_actions_v2',
]) {
  assert(!policy.includes(`collection: '${collection}'`),
    `unreviewed source must not silently receive a disposal decision: ${collection}`);
}
assert.match(processor, /if \(apply\) throw new Error\('ACCOUNT_ERASURE_ADMISSION_FREEZE_NOT_VERIFIED'\)/);
console.log('PASS outbox, moderation and guardian residuals inventoried without disposal authority');

console.log('PASS erasure policy distinguishes delete, withdraw and operational retention');
console.log('PASS shared planner owns dry-run/apply mode and auth-delete-last contract');
console.log('PASS active marketplace transactions block destructive erasure');
console.log('PASS processor reports transaction locks plus nested chat residuals as retained evidence');
console.log('PASS processor defaults to dry-run and requires explicit staging apply gate');
console.log('PASS Auth deletion occurs only after Firestore withdrawal/deletion');
console.log('PASS transaction/lock/chat/report evidence is not blindly deleted');
console.log('PASS source-only staging smoke contract exists; no staging smoke or destructive erasure executed');
console.log('Account erasure safety contract: PASS');

// P01 checks the GENERATED runtime rules, not just an isolated demo Ruleset.
const accountRuleHardener = fs.readFileSync('scripts/harden-user-block-rules.mjs','utf8');
assert(accountRuleHardener.includes('commerceAccountsEligible(request.resource.data.buyer_id, request.resource.data.seller_id)'),
  'generated offer create must check buyer AND seller active erasure');
assert(accountRuleHardener.includes('commerceAccountsEligible(resource.data.buyer_id, resource.data.seller_id)'),
  'generated offer update must check buyer AND seller active erasure');
const generatedOfferTests = fs.readFileSync('tests/firestore.v2.account-operations.test.mjs','utf8');
for (const phrase of [
  'P01 generated Rules accept an eligible offer without erasure',
  'P01 generated Rules refuse offers while buyer deletion is pending',
  'P01 generated Rules refuse offers while seller deletion is processing',
  'P01 generated Rules accept rejected seller deletion only',
  'P01 generated Rules fail closed on unknown seller erasure state',
]) assert(generatedOfferTests.includes(phrase),'missing generated Rules regression: '+phrase);
console.log('PASS generated offer Rules include both-party erasure guards and emulator regressions');
