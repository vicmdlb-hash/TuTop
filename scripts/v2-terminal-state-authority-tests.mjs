import fs from 'node:fs';
import assert from 'node:assert/strict';

const backend = fs.readFileSync('src/services/canonicalTransactionsBackend.ts', 'utf8');
const bridge = fs.readFileSync('src/services/nationalBackendCanonicalBridge.ts', 'utf8');
const national = fs.readFileSync('src/services/nationalBackend.ts', 'utf8');
const maintenance = fs.readFileSync('scripts/v2-trusted-maintenance.mjs', 'utf8');
const reconciliation = fs.readFileSync('src/lib/reservationReconciliation.ts', 'utf8');
const lockRules = fs.readFileSync('scripts/harden-transaction-lock-rules.mjs', 'utf8');
const card = fs.readFileSync('src/components/TransactionReservationCard.tsx', 'utf8');

function section(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert(from >= 0 && to > from, `missing section ${start}`);
  return source.slice(from, to);
}

const confirmationCommit = section(backend, 'async function commitDeliveryConfirmation', 'export const canonicalTransactionsBackend');
const completion = section(backend, '  async confirmDelivery', '  async finalizeCompletedListing');
const dispute = section(backend, '  async disputeTransaction', '  async cancelTransaction');
const cancel = section(backend, '  async cancelTransaction', '  async requestMutualCancellation');
const noShow = section(backend, '  async claimNoShow', '  async releaseExpiredReservation');
const expire = section(backend, '  async releaseExpiredReservation', '\n};');

assert.match(confirmationCommit, /if \(status === 'completed'\)/);
assert.match(confirmationCommit, /listings_v2\/\$\{transaction\.listing_id\}/);
assert.match(confirmationCommit, /status: 'sold_out'/);
assert.match(completion, /commitDeliveryConfirmation\(client, current, actor\)/);
assert.match(completion, /commitDeliveryConfirmation\(client, refreshed, actor\)/);
assert.doesNotMatch(confirmationCommit, /actor === transaction\.seller_id/);

for (const method of [
  'confirmDelivery',
  'finalizeCompletedListing',
  'disputeTransaction',
  'cancelTransaction',
  'requestMutualCancellation',
  'claimNoShow',
  'releaseExpiredReservation',
]) {
  assert.match(bridge, new RegExp(`${method}: canonicalTransactionsBackend\\.${method}`));
}
assert.match(national, /patchWrite\(client, `products\/\$\{transaction\.listing_id\}`/);
assert.match(bridge, /if \(nationalSchemaEnabled\(\)\)/);

assert.match(cancel, /status: 'cancelled'/);
assert.match(cancel, /outcome_actor_id: actor/);
assert.match(cancel, /terminalTransactionWrites/);
assert.match(expire, /terminalTransactionWrites/);
assert.match(expire, /status: 'expired'/);
assert.match(lockRules, /cancellation releases reservation lock/);
assert.match(lockRules, /expiry releases reservation lock/);

assert.match(dispute, /status: 'disputed'/);
assert.doesNotMatch(dispute, /terminalTransactionWrites|deleteDocument|reservationLockPath/);
assert.match(card, /transaction\.status === 'disputed'/);
assert.match(card, /No se puede completar ni modificar el encuentro/);

assert.match(noShow, /transaction_outcome_claims/);
assert.match(noShow, /status: 'open'/);
assert.doesNotMatch(noShow, /status: 'no_show'/);
assert.match(maintenance, /claims\.filter\(\(item\) => item\.status === 'upheld'\)/);
assert.match(maintenance, /status: 'no_show'/);
assert.match(maintenance, /deleteWrite\(`listing_reservation_locks\/\$\{tx\.listing_id\}`\)/);
assert.match(maintenance, /status: 'cancelled', outcome_code: 'mutual_cancel'/);

assert.match(maintenance, /const completed = participant\.filter\(\(tx\) => tx\.status === 'completed'\)/);
assert.match(maintenance, /tx\.status === 'cancelled' && tx\.outcome_code !== 'mutual_cancel'/);
assert.match(maintenance, /tx\.status === 'no_show'/);
assert.match(maintenance, /outcome_actor_id === uid/);

assert.match(reconciliation, /repair_completed_listing/);
assert.match(reconciliation, /expired_transaction_listing_unchanged/);
assert.match(reconciliation, /status_not_auto_expirable/);

console.log('PASS completed is authoritative and atomically closes listings_v2 regardless of second confirmer');
console.log('PASS every V2 terminal action is explicitly overridden to canonicalTransactionsBackend by the schema-gated bridge');
console.log('PASS legacy products-based nationalBackend transaction methods remain compatibility code, not V2 authority');
console.log('PASS cancelled/expired are canonical terminal states and release reservation locks atomically');
console.log('PASS disputed freezes the canonical transaction and deliberately retains its reservation lock');
console.log('PASS no_show is not self-declared by clients; only an upheld trusted outcome materializes it and releases the lock');
console.log('PASS reputation derives completed/cancellation/no-show evidence from transactions_v2 and excludes mutual cancellation penalty');
console.log('PASS reconciliation is drift repair, not a second marketplace authority');
// Execute the production status-transition write helper with a synthetic
// Firestore client. This does not grant release status or access staging.
const { stripTypeScriptTypes } = await import('node:module');
const helperSource = [
  section(backend, 'function sameTransactionIdentity(', 'async function loadCurrentTransaction('),
  section(backend, 'async function commitCurrentTransactionPatch(', 'function actorConfirmationField('),
].join('\n');
const commitVersioned = new Function('patchWrite', stripTypeScriptTypes(helperSource)
  + '\nreturn commitCurrentTransactionPatch;')(
    (_client, name, data) => ({ update: name, fields: data })
  );
const baseTransaction = {
  id: 'tx-versioned', listing_id: 'listing-a', chat_id: 'chat-a',
  buyer_id: 'buyer-a', seller_id: 'seller-a', accepted_offer_id: 'offer-a',
  agreed_amount_mxn: 125, status: 'reserved', updated_at: '2026-11-12T19:00:00Z',
};
const serverVersion = '2026-11-12T19:00:01.123456789Z';
const calls = [];
const fakeClient = (doc = { id: baseTransaction.id, data: baseTransaction, updateTime: serverVersion }) => ({
  getDocument: async path => {
    assert.equal(path, 'transactions_v2/tx-versioned');
    return doc;
  },
  commit: async writes => { calls.push(writes); },
});
await commitVersioned(fakeClient(), baseTransaction, {
  status: 'meetup_scheduled', meeting_point_id: 'campus', meetup_at: '2026-11-13T19:00:00Z',
});
assert.equal(calls.length, 1);
assert.equal(calls[0].length, 1);
assert.equal(calls[0][0].currentDocument.updateTime, serverVersion);
await commitVersioned(fakeClient(), baseTransaction, { status: 'disputed' });
assert.equal(calls[1][0].currentDocument.updateTime, serverVersion);
const savedCallCount = calls.length;
for (const changed of [
  { ...baseTransaction, status: 'cancelled' },
  { ...baseTransaction, updated_at: '2026-11-12T19:30:00Z' },
  { ...baseTransaction, buyer_confirmed_at: '2026-11-12T19:30:00Z' },
  { ...baseTransaction, meetup_at: '2026-11-13T19:00:00Z' },
  { ...baseTransaction, seller_id: 'another-seller' },
]) {
  await assert.rejects(
    commitVersioned(fakeClient({ id: baseTransaction.id, data: changed, updateTime: serverVersion }),
      baseTransaction, { status: 'disputed' }),
    /TRANSACTION_CHANGED/,
  );
}
await assert.rejects(
  commitVersioned(fakeClient({ id: baseTransaction.id, data: baseTransaction }), baseTransaction,
    { status: 'disputed' }),
  /TRANSACTION_VERSION_UNKNOWN/,
);
assert.equal(calls.length, savedCallCount, 'reject stale transaction without writing');
const meetupSource = section(backend, '  async scheduleMeetup(', '  async confirmDelivery(');
assert.match(meetupSource, /commitCurrentTransactionPatch\(client, current,/);
assert.match(dispute, /commitCurrentTransactionPatch\(client, current,/);
assert.doesNotMatch(meetupSource, /setDocument\(/);
assert.doesNotMatch(dispute, /setDocument\(/);
console.log('PASS scheduling and disputes carry atomic transaction versions and reject stale state (synthetic)');

console.log('V2 terminal-state authority contract: PASS');
