import fs from 'node:fs';
import assert from 'node:assert/strict';

const processor = fs.readFileSync('scripts/process-account-erasure.mjs', 'utf8');
const planner = fs.readFileSync('scripts/account-erasure-planner.mjs', 'utf8');
const liveSmoke = fs.readFileSync('scripts/staging-account-erasure-smoke.mjs', 'utf8');
const smokeWorkflow = fs.readFileSync('.github/workflows/staging-v2-smoke.yml', 'utf8');
const policy = fs.readFileSync('src/lib/accountErasurePolicy.ts', 'utf8');

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
assert.match(processor, /ACCOUNT_ERASURE_BLOCKED/);
assert.match(processor, /terminalStatuses = new Set\(\['completed', 'cancelled', 'expired', 'no_show'\]\)/);
assert.match(planner, /mode: apply \? 'apply' : 'dry-run'/);
assert.match(planner, /blocked: normalizedBlockers\.length > 0/);
assert.match(planner, /safe_to_execute_in_staging: !plan\.blocked/);
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

assert.match(liveSmoke, /createUserWithEmailAndPassword/);
assert.match(liveSmoke, /account_deletion_requests/);
assert.match(liveSmoke, /process-account-erasure\.mjs', '--uid', uid, '--apply'/);
assert.match(liveSmoke, /retainedNestedPaths/);
assert.match(liveSmoke, /residual_manifest_version/);
assert.match(liveSmoke, /fieldInteger\(request, 'retained_count'\)/);
assert.match(liveSmoke, /signInWithEmailAndPassword/);
assert.match(liveSmoke, /Real staging account erasure smoke: PASS/);
assert.match(smokeWorkflow, /Real controlled account erasure smoke/);
assert.match(smokeWorkflow, /TUTOP_ALLOW_ACCOUNT_ERASURE: staging-reviewed/);
assert.match(smokeWorkflow, /node scripts\/staging-account-erasure-smoke\.mjs/);

console.log('PASS erasure policy distinguishes delete, withdraw and operational retention');
console.log('PASS shared planner owns dry-run/apply mode and auth-delete-last contract');
console.log('PASS active marketplace transactions block destructive erasure');
console.log('PASS processor reports transaction locks plus nested chat residuals as retained evidence');
console.log('PASS processor defaults to dry-run and requires explicit staging apply gate');
console.log('PASS Auth deletion occurs only after Firestore withdrawal/deletion');
console.log('PASS transaction/lock/chat/report evidence is not blindly deleted');
console.log('PASS real staging smoke exercises synthetic destructive erasure behind explicit gate');
console.log('Account erasure safety contract: PASS');
