import assert from 'node:assert/strict';
import fs from 'node:fs';

const backend = fs.readFileSync('src/services/canonicalTransactionsBackend.ts','utf8');
const bridge = fs.readFileSync('src/services/nationalBackendCanonicalBridge.ts','utf8');
const runtimeRules = fs.readFileSync('scripts/harden-runtime-v2-rules.mjs','utf8');
const lockRules = fs.readFileSync('scripts/harden-transaction-lock-rules.mjs','utf8');

function section(start, end) {
  const from = backend.indexOf(start);
  const to = backend.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `missing section ${start}`);
  return backend.slice(from, to);
}

const schedule = section('  async scheduleMeetup', '  async confirmDelivery');
const dispute = section('  async disputeTransaction', '  async cancelTransaction');
const cancel = section('  async cancelTransaction', '  async requestMutualCancellation');
const expire = section('  async releaseExpiredReservation', '\n};');

for (const [name, source] of [['schedule',schedule],['dispute',dispute],['cancel',cancel],['expire',expire]]) {
  assert.match(source, /const current = await loadCurrentTransaction\(client, transaction\)/, `${name} must re-read canonical transaction state`);
  assert.doesNotMatch(source, /canActOnTransaction\(transaction, actor/, `${name} must not authorize from stale input`);
}

assert.match(schedule, /canActOnTransaction\(current, actor, 'schedule_meetup'\)/);
assert.match(dispute, /canActOnTransaction\(current, actor, 'dispute'\)/);
assert.match(cancel, /assertCancelable\(current, actor\)/);
assert.match(cancel, /terminalTransactionWrites\(client, current, patch\)/);
assert.match(expire, /canActOnTransaction\(current, actor, 'expire'\)/);
assert.match(expire, /terminalTransactionWrites\(client, current/);

for (const method of ['scheduleMeetup','disputeTransaction','cancelTransaction','releaseExpiredReservation']) {
  assert.match(bridge, new RegExp(`${method}: canonicalTransactionsBackend\\.${method}`));
}

assert.match(runtimeRules, /resource\.data\.status in \['reserved','meetup_scheduled'\]/);
assert.match(runtimeRules, /request\.resource\.data\.status == 'cancelled'/);
assert.match(lockRules, /expiry releases reservation lock/);
assert.match(lockRules, /cancellation releases reservation lock/);

console.log('PASS mutable transaction actions re-read canonical state before authorization');
console.log('PASS cancel/expire terminal writes are built from canonical state');
console.log('PASS strict Rules remain authoritative and unchanged');
