import fs from 'node:fs';
import assert from 'node:assert/strict';
import { ACCOUNT_ERASURE_POLICY } from '../src/lib/accountErasurePolicy.ts';

const processor = fs.readFileSync('scripts/process-account-erasure.mjs', 'utf8');
const policy = new Map(ACCOUNT_ERASURE_POLICY.map((item) => [item.collection, item]));

for (const collection of ['users','user_private','notification_preferences','device_tokens','notification_receipts','favorites','saved_searches','wallets','wallet_transactions','verificationRequests','publicVerifications','reputation','moderationStatus']) {
  assert.equal(policy.get(collection)?.disposition, 'delete', `${collection} debe eliminarse`);
}
for (const collection of ['listings_v2','demand_requests']) assert.equal(policy.get(collection)?.disposition, 'withdraw', `${collection} debe retirarse`);
for (const collection of ['account_deletion_requests','transactions_v2','offers','chats','reviews','reports','audit_log']) {
  assert.equal(policy.get(collection)?.disposition, 'retain_operational', `${collection} debe tener retención operativa`);
}

assert.match(processor, /projectId !== REQUIRED/);
assert.match(processor, /TUTOP_ALLOW_ACCOUNT_ERASURE !== 'staging-reviewed'/);
assert.match(processor, /mode: apply \? 'apply' : 'dry-run'/);
assert.match(processor, /DRY-RUN: no se modificó Firestore\/Auth/);
assert.match(processor, /status: 'archived'/);
assert.match(processor, /status: 'expired'/);
assert.match(processor, /await adminDeleteDocument\(`users\/\$\{uid\}`\)/);
assert.match(processor, /await adminDeleteTestUsers\(\[uid\]\)/);
assert(processor.indexOf("await adminDeleteTestUsers([uid])") > processor.indexOf("await adminDeleteDocument(`users/${uid}`)"), 'Auth debe borrarse al final');
assert.doesNotMatch(processor, /adminDeleteDocument\(`transactions_v2/);
assert.doesNotMatch(processor, /adminDeleteDocument\(`chats/);
assert.doesNotMatch(processor, /adminDeleteDocument\(`reports/);

console.log('PASS erasure policy distinguishes delete, withdraw and operational retention');
console.log('PASS processor defaults to dry-run and requires explicit staging apply gate');
console.log('PASS Auth deletion occurs only after Firestore withdrawal/deletion');
console.log('PASS transaction/chat/report evidence is not blindly deleted');
console.log('Account erasure safety contract: PASS');
