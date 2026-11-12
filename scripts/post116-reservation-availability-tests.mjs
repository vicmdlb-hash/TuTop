import assert from 'node:assert/strict';
import fs from 'node:fs';

const schema = fs.readFileSync('src/lib/listingSchemaV2.ts','utf8');
const listings = fs.readFileSync('src/services/canonicalListingsBackend.ts','utf8');
const tx = fs.readFileSync('src/services/canonicalTransactionsBackend.ts','utf8');
const card = fs.readFileSync('src/components/ProductCard.tsx','utf8');
const detail = fs.readFileSync('src/components/ProductDetail.tsx','utf8');
const store = fs.readFileSync('src/store/useAppStore.ts','utf8');
const prepare = fs.readFileSync('scripts/prepare-firestore-v2-rules.mjs','utf8');
const lockRules = fs.readFileSync('scripts/harden-transaction-lock-rules.mjs','utf8');

assert.match(schema, /availability_status\?: 'available' \| 'reserved'/);
assert.match(listings, /availability_status: data\.availability_status === 'reserved' \? 'reserved' : 'available'/);
assert.match(listings, /availability_status: 'available' as const/);
assert.match(listings, /Number\(a\.availability_status === 'reserved'\)/);

assert.match(tx, /reservationAvailabilityWrite/);
assert.match(tx, /availability_status: availability/);
assert.match(tx, /reservationAvailabilityWrite\(client, offer\.listing_id, 'reserved', at\)/);
assert.match(tx, /reservationAvailabilityWrite\(client, transaction\.listing_id, 'available'/);
assert.match(tx, /LISTING_ALREADY_RESERVED/);

assert.match(prepare, /availability_status/);
assert.match(prepare, /affectedKeys\(\)\.hasAny\(\['availability_status'\]\)/);
assert.match(lockRules, /availability_status == 'reserved'/);
assert.match(lockRules, /availability_status == 'available'/);

assert.match(card, /Reservado temporalmente/);
assert.match(card, /reservedForViewer/);
assert.match(detail, /Reservado temporalmente/);
assert.match(detail, /disabled=\{reserved\}/);
assert.match(detail, /const reserved = product\.availability_status === 'reserved'/);
assert.match(detail, /if \(ownProduct \|\| reserved\) return;/);
const topiQuickReply = detail.split("['¿Sigue disponible?'")[1]?.split("</button>)}</div>", 1)[0];
assert(topiQuickReply, 'Topi suggested-question buttons must exist in ProductDetail');
assert.match(topiQuickReply, /disabled=\{reservedForViewer\}/,
  'Topi shortcut must not create a new chat for a buyer who does not own a reserved listing');
assert.match(topiQuickReply, /onClick=\{\(\) => \{ if \(reservedForViewer\) return; const chatId = contactProduct\(product\.id\)/,
  'Topi shortcut handler must independently enforce reservation gate before contact');

assert.match(store, /product\.availability_status === 'reserved' && !existing/);

// A stale UI transaction snapshot must never authorize new outcome records or
// a sold-out listing. Each action re-reads the canonical transaction first.
// This is a source contract; Firebase Rules and real concurrent E2E remain gates.
function actionSource(name, nextName) {
  const start = tx.indexOf('  async ' + name + '(');
  const end = tx.indexOf('  async ' + nextName + '(', start);
  assert(start >= 0 && end > start, 'missing canonical action: ' + name);
  return tx.slice(start, end);
}
const finalize = actionSource('finalizeCompletedListing', 'disputeTransaction');
const mutual = actionSource('requestMutualCancellation', 'claimNoShow');
const noShow = actionSource('claimNoShow', 'releaseExpiredReservation');
for (const [label, source] of [['finalizeCompletedListing', finalize], ['requestMutualCancellation', mutual], ['claimNoShow', noShow]]) {
  const readIndex = source.indexOf('const current = await loadCurrentTransaction(client, transaction);');
  assert(readIndex >= 0, label + ' must fetch canonical transaction state');
  const checksIndex = source.indexOf('if (actor !== current.');
  const mutualChecksIndex = source.indexOf('assertCancelable(current, actor);');
  assert((checksIndex > readIndex || mutualChecksIndex > readIndex),
    label + ' must validate authoritative state before acting');
}
assert.match(finalize, /current\.status !== 'completed'/);
assert.match(finalize, /listings_v2\/\$\{current\.listing_id\}/);
assert.match(mutual, /assertCancelable\(current, actor\)/);
assert.match(mutual, /transaction_id: current\.id/);
assert.match(noShow, /current\.status !== 'meetup_scheduled'/);
assert.match(noShow, /const meetupMs = Date\.parse\(current\.meetup_at\)/);
assert.match(noShow, /transaction_id: current\.id/);
console.log('PASS seller finalization, mutual cancellation and no-show use current server transaction, not stale UI state');

// Execute the actual terminal write builder with fake, credential-free Firestore
// reads. Version guards are assertions on generated writes, not live Firebase E2E.
const { stripTypeScriptTypes } = await import('node:module');
function sourceBetween(startToken, endToken) {
  const start = tx.indexOf(startToken);
  const end = tx.indexOf(endToken, start);
  assert(start >= 0 && end > start, 'missing executable terminal source section');
  return tx.slice(start, end);
}
const terminalSource = [
  sourceBetween('function patchWrite(', '\nfunction getClient()'),
  sourceBetween('function sameTransactionIdentity(', '\nasync function loadCurrentTransaction('),
  sourceBetween('async function terminalTransactionWrites(', '\nasync function assertReservationLockConsistent('),
].join('\n');
const buildTerminal = new Function('nowIso',
  stripTypeScriptTypes(terminalSource) + '\nreturn terminalTransactionWrites;',
)(() => '2026-11-12T19:00:00.000Z');
const transaction = {
  id: 'tx-1', listing_id: 'list-1', chat_id: 'chat-1',
  buyer_id: 'buyer-1', seller_id: 'seller-1', accepted_offer_id: 'offer-1',
  agreed_amount_mxn: 125, status: 'reserved', updated_at: '2026-11-12T18:00:00.000Z',
};
const TX_VERSION = '2026-11-12T18:01:00.000000Z';
const LOCK_VERSION = '2026-11-12T18:02:00.000000Z';
const txDoc = { id: transaction.id, updateTime: TX_VERSION, data: { ...transaction } };
const lockDoc = { updateTime: LOCK_VERSION, data: { transaction_id: transaction.id } };
function clientWithDocs(txResult = txDoc, lockResult = lockDoc) {
  return {
    getDocument: async (path) => {
      if (path === 'transactions_v2/tx-1') return txResult;
      if (path === 'listing_reservation_locks/list-1') return lockResult;
      throw Error('UNEXPECTED_DOCUMENT_PATH');
    },
    encodeDocumentForWrite: (path, data) => ({ name: 'documents/' + path, fields: data }),
    documentName: (path) => 'documents/' + path,
  };
}
const nextPatch = { status: 'cancelled', updated_at: '2026-11-12T19:00:00.000Z' };
const writes = await buildTerminal(clientWithDocs(), transaction, nextPatch);
assert.equal(writes.length, 3);
assert.equal(writes[0].currentDocument.updateTime, TX_VERSION,
  'transaction must be guarded in the same atomic commit');
assert.equal(writes[1].currentDocument.updateTime, LOCK_VERSION,
  'reservation lock must retain its independent version precondition');
assert.equal(writes[2].update.fields.availability_status, 'available');
const afterConcurrentUpdate = { txVersion: '2026-11-12T18:03:00.000000Z', lockVersion: LOCK_VERSION };
assert.notEqual(writes[0].currentDocument.updateTime, afterConcurrentUpdate.txVersion,
  'a concurrent transaction status change must invalidate the entire commit');
assert.equal(writes[1].currentDocument.updateTime, afterConcurrentUpdate.lockVersion);
await assert.rejects(buildTerminal(clientWithDocs({ ...txDoc, updateTime: '' }), transaction, nextPatch),
  /TRANSACTION_VERSION_UNKNOWN/);
await assert.rejects(buildTerminal(clientWithDocs({ ...txDoc, data: { ...transaction, status: 'completed' } }), transaction, nextPatch),
  /TRANSACTION_CHANGED/);
await assert.rejects(buildTerminal(clientWithDocs({ ...txDoc, data: { ...transaction, updated_at: '2026-11-12T18:30:00.000Z' } }), transaction, nextPatch),
  /TRANSACTION_CHANGED/);
await assert.rejects(buildTerminal(clientWithDocs(txDoc, { ...lockDoc, data: { transaction_id: 'tx-other' } }), transaction, nextPatch),
  /RESERVATION_LOCK_MISMATCH/);
console.log('PASS terminal transaction + reservation lock writes are version-bound together and stale snapshots fail closed');

console.log('PASS reservation availability truth is public-safe, atomic with lock lifecycle and blocks new buyer actions while reserved');
