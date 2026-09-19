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

assert.match(processor, /projectId !== REQUIRED/);
assert.match(processor, /TUTOP_ALLOW_ACCOUNT_ERASURE !== 'staging-reviewed'/);
assert.match(processor, /buildAccountErasurePlan/);
assert.match(processor, /\['listing_reservation_locks', 'buyer_id'\]/);
assert.match(processor, /\['listing_reservation_locks', 'seller_id'\]/);
assert.match(processor, /active_marketplace_transaction/);
assert.match(processor, /ACCOUNT_ERASURE_BLOCKED/);
assert.match(processor, /terminalStatuses = new Set\(\['completed', 'cancelled', 'expired', 'no_show'\]\)/);
assert.match(planner, /mode: apply \? 'apply' : 'dry-run'/);
assert.match(planner, /blocked: normalizedBlockers\.length > 0/);
assert.match(planner, /safe_to_execute_in_staging: !plan\.blocked/);
assert.match(planner, /auth_delete_last: true/);
assert.match(processor, /DRY-RUN: no se modificó Firestore\/Auth/);
assert.match(processor, /DRY-RUN BLOQUEADO/);
assert.match(processor, /adminRunQueryAll/);
assert.doesNotMatch(processor, /adminRunQuery\(/);
assert.match(processor, /ACCOUNT_ERASURE_RESIDUAL_DIRECT/);
assert.match(processor, /ACCOUNT_ERASURE_RESIDUAL_QUERY/);
assert.match(processor, /ACCOUNT_ERASURE_WITHDRAWAL_NOT_FINAL/);
assert(processor.indexOf('ACCOUNT_ERASURE_RESIDUAL_QUERY') < processor.indexOf("status: 'completed'"), 'La verificación residual debe ocurrir antes de completed');
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
assert.match(liveSmoke, /signInWithEmailAndPassword/);
assert.match(liveSmoke, /Real staging account erasure smoke: PASS/);
assert.match(smokeWorkflow, /Real controlled account erasure smoke/);
assert.match(smokeWorkflow, /TUTOP_ALLOW_ACCOUNT_ERASURE: staging-reviewed/);
assert.match(smokeWorkflow, /node scripts\/staging-account-erasure-smoke\.mjs/);

console.log('PASS erasure policy distinguishes delete, withdraw and operational retention');
console.log('PASS shared planner owns dry-run/apply mode and auth-delete-last contract');
console.log('PASS active marketplace transactions block destructive erasure');
console.log('PASS processor reports transaction reservation locks as retained evidence');
console.log('PASS processor defaults to dry-run and requires explicit staging apply gate');
console.log('PASS Auth deletion occurs only after Firestore withdrawal/deletion');
console.log('PASS transaction/lock/chat/report evidence is not blindly deleted');
console.log('PASS real staging smoke exercises synthetic destructive erasure behind explicit gate');
console.log('Account erasure safety contract: PASS');
