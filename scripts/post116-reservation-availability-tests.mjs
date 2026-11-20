import assert from 'node:assert/strict';
import fs from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

const read = (path) => fs.readFileSync(path, 'utf8').replace(/\r\n?/g, '\n');
const schema = read('src/lib/listingSchemaV2.ts');
const listings = read('src/services/canonicalListingsBackend.ts');
const tx = read('src/services/canonicalTransactionsBackend.ts');
const offers = read('src/services/canonicalOffersBackend.ts');
const card = read('src/components/ProductCard.tsx');
const reservationCard = read('src/components/TransactionReservationCard.tsx');
const detail = read('src/components/ProductDetail.tsx');
const store = read('src/store/useAppStore.ts');
const prepare = read('scripts/prepare-firestore-v2-rules.mjs');
const lockRules = read('scripts/harden-transaction-lock-rules.mjs');

assert.match(schema, /availability_status\?: 'available' \| 'reserved'/);
assert.match(listings, /availability_status: !Number\.isSafeInteger\(data\.quantity\)/);
assert.match(listings, /data\.availability_status === 'available' \|\| data\.availability_status === undefined \? 'available' : data\.availability_status === 'reserved' \? 'reserved' : 'unverified'/);
assert.match(listings, /stock: Number\.isSafeInteger\(data\.quantity\)/);
assert.match(listings, /availability_status: 'available' as const/);
// Exercise the actual canonical projection expression, with no Firebase credentials.
const availabilityMatch = listings.match(/availability_status: ([^\n]+),\n\s*punto_encuentro:/);
assert(availabilityMatch, 'canonical availability projection must remain traceable');
const projectAvailability = new Function('data', 'validPrice = true', 'return (' + availabilityMatch[1] + ');');
assert.equal(projectAvailability({ quantity: 1, availability_status: 'available' }), 'available');
assert.equal(projectAvailability({ quantity: 1, availability_status: 'available' }, false), 'unverified',
  'a listing with a malformed price may not appear immediately offerable');
assert.match(listings, /const validPrice = typeof data\.price_mxn === 'number' && Number\.isFinite\(data\.price_mxn\)/);
assert.match(listings, /estado: validPrice \? legacyStatus\(data\.status\) : 'Pausado'/);
assert.equal(projectAvailability({ quantity: 1, availability_status: 'reserved' }), 'reserved');
assert.equal(projectAvailability({ quantity: 1 }), 'available', 'legacy absent status remains compatible');
assert.equal(projectAvailability({ quantity: 1, availability_status: null }), 'unverified');
assert.equal(projectAvailability({ quantity: 1, availability_status: 'unexpected' }), 'unverified');
assert.equal(projectAvailability({ quantity: 1, availability_status: false }), 'unverified');
for (const quantity of [undefined, null, 0, -1, 1.5, 100, '1']) {
  assert.equal(projectAvailability({ quantity, availability_status: 'available' }), 'unverified',
    'bad stock must never be projected as available');
}

assert.match(listings, /Number\(a\.availability_status !== 'available'\)/);

// Unknown canonical lifecycle states must not be projected as public Activo.
// Verify the actual TypeScript status conversion instead of a replicated model.
function sourceFunction(name, nextName) {
  const start = listings.indexOf('function ' + name + '(');
  const end = listings.indexOf('\nfunction ' + nextName + '(', start);
  assert(start >= 0 && end > start, 'missing status projection source ' + name);
  return new Function(stripTypeScriptTypes(listings.slice(start, end)) + '\nreturn ' + name + ';')();
}
const toLegacyStatus = sourceFunction('legacyStatus', 'canonicalStatus');
const toCanonicalStatus = sourceFunction('canonicalStatus', 'legacyDelivery');
assert.equal(toLegacyStatus('active'), 'Activo');
assert.equal(toLegacyStatus('sold_out'), 'Vendido');
assert.equal(toLegacyStatus('paused'), 'Pausado');
assert.equal(toLegacyStatus(undefined), 'Pausado');
assert.equal(toLegacyStatus('UNKNOWN_FROM_FIRESTORE'), 'Pausado');
assert.equal(toCanonicalStatus('Activo'), 'active');
assert.equal(toCanonicalStatus('Reservado'), 'active', 'legacy transaction reservation remains compatible');
assert.equal(toCanonicalStatus('Pausado'), 'paused');
assert.equal(toCanonicalStatus(undefined), 'paused');
assert.equal(toCanonicalStatus('UNKNOWN_FROM_UI'), 'paused');


// Execute the real offer precondition with credential-free synthetic reads.
// A corrupt price cannot be allowed merely because status and stock look valid.
const offerableStart = offers.indexOf('async function assertOfferableListing(');
const offerableEnd = offers.indexOf('\nfunction assertOfferNotExpired(', offerableStart);
assert(offerableStart >= 0 && offerableEnd > offerableStart);
const assertPriceOfferable = new Function(
  stripTypeScriptTypes(offers.slice(offerableStart, offerableEnd))
  + '\nreturn assertOfferableListing;'
)();
const safeListing = {
  seller_id: 'synthetic-seller', status: 'active',
  moderation_status: 'approved', quantity: 1,
  availability_status: 'available', price_mxn: 0,
};
const clientWithListing = listing => ({
  getDocument: async () => ({ data: listing }),
});
await assert.doesNotReject(assertPriceOfferable(clientWithListing(safeListing), 'listing-test', 'synthetic-seller'),
  'explicit free (0 MXN) listings remain supported');
for (const invalidPrice of [-1, Number.NaN, Infinity, '250', null, undefined]) {
  await assert.rejects(
    assertPriceOfferable(clientWithListing({ ...safeListing, price_mxn: invalidPrice }), 'listing-test', 'synthetic-seller'),
    /LISTING_PRICE_UNVERIFIED/,
    'invalid canonical prices must fail closed before offer submission',
  );
}

assert.match(tx, /reservationAvailabilityWrite/);
assert.match(tx, /availability_status: availability/);
assert.match(tx, /reservationAvailabilityWrite\(client, offer\.listing_id, 'reserved', at\)/);
assert.match(tx, /reservationAvailabilityWrite\(client, transaction\.listing_id, 'available'/);
assert.match(tx, /LISTING_ALREADY_RESERVED/);

// Exercise the real canonical reservation precondition with fake reads: no Firebase.
const activeSource = tx.slice(
  tx.indexOf('async function assertActiveCanonicalListing('),
  tx.indexOf('\nfunction assertCancelable(')
);
assert(activeSource.startsWith('async function assertActiveCanonicalListing('));
const assertActiveListing = new Function(
  stripTypeScriptTypes(activeSource) + '\nreturn assertActiveCanonicalListing;'
)();
const offerFixture = {listing_id:'listing-test',seller_id:'seller-test'};
const reservationClient = (availability, quantity = 1) => ({
  getDocument: async () => ({id:'listing-test',data:{seller_id:'seller-test',status:'active',moderation_status:'approved',availability_status:availability,quantity,price_mxn:250}})
});
await assertActiveListing(reservationClient('available'),offerFixture);
await assertActiveListing(reservationClient(undefined),offerFixture);
await assert.rejects(assertActiveListing(reservationClient('reserved'),offerFixture), /LISTING_ALREADY_RESERVED/);
for (const bad of [null, 'unknown', false, 0]) {
  await assert.rejects(assertActiveListing(reservationClient(bad),offerFixture), /LISTING_AVAILABILITY_UNVERIFIED/);
}
const offerSource = offers.slice(
  offers.indexOf('async function assertOfferableListing('),
  offers.indexOf('\nfunction assertOfferNotExpired(')
);
assert(offerSource.startsWith('async function assertOfferableListing('));
const assertOfferableListing = new Function(stripTypeScriptTypes(offerSource) + '\nreturn assertOfferableListing;')();
await assertOfferableListing(reservationClient('available', 1),'listing-test','seller-test');
await assertActiveListing(reservationClient('available', 1),offerFixture);
for (const quantity of [Number.NaN, null, 0, -1, 1.5, 100, '1']) {
  await assert.rejects(assertActiveListing(reservationClient('available',quantity),offerFixture), /LISTING_STOCK_UNVERIFIED/);
  await assert.rejects(assertOfferableListing(reservationClient('available',quantity),'listing-test','seller-test'), /LISTING_STOCK_UNVERIFIED/);
}

assert.match(schema, /availability_not_verified/);
assert.match(schema, /product\.availability_status !== 'available'/);
assert.match(schema, /product\.availability_status !== 'reserved'/);
assert.match(schema, /negotiable: Boolean\(product\.precio_negociable\)/);


assert.match(prepare, /availability_status/);
assert.match(prepare, /affectedKeys\(\)\.hasAny\(\['availability_status'\]\)/);
assert.match(lockRules, /availability_status == 'reserved'/);
assert.match(lockRules, /availability_status == 'available'/);

// #50: Missing or corrupted reservation timestamps must never be labeled
// active or expose an unverified meeting plan in the Android transaction card.
const remainingStart = reservationCard.indexOf('function remainingLabel(');
const remainingEnd = reservationCard.indexOf('\nfunction defaultMeetupInput(', remainingStart);
assert(remainingStart >= 0 && remainingEnd > remainingStart);
const remainingLabel = new Function(
  stripTypeScriptTypes(reservationCard.slice(remainingStart, remainingEnd)) + '\nreturn remainingLabel;'
)();
const referenceClock = Date.parse('2026-11-15T07:00:00.000Z');
assert.equal(remainingLabel(undefined, referenceClock), null);
assert.equal(remainingLabel('not-a-date', referenceClock), null);
assert.equal(remainingLabel('2026-11-15T06:59:00.000Z', referenceClock), 'Reserva vencida');
assert.equal(remainingLabel('2026-11-15T07:01:00.000Z', referenceClock), '1 min restantes');
assert.match(reservationCard, /const reservationClockUnverified = transaction\?\.status === 'reserved' && !Number\.isFinite\(expiryMs\)/);
assert.match(reservationCard, /reservationClockUnverified \? 'Vencimiento por verificar' : remaining \|\| 'Reserva vencida'/);
assert.match(reservationCard, /!expired && !reservationClockUnverified && <div/);
assert.match(reservationCard, /if \(!selectedPointId \|\| !meetupAt \|\| busy \|\| expired \|\| reservationClockUnverified\) return/);
assert.match(reservationCard, /Number\.isFinite\(date\.getTime\(\)\)/);
assert.match(reservationCard, /!Number\.isFinite\(Date\.parse\(transaction\.meetup_at\)\)/);
console.log('PASS reservation card shows unverified/expired status truth and rejects malformed meeting timestamps');

assert.match(card, /Reservado temporalmente/);
assert.match(card, /reservedForViewer/);
assert.match(detail, /Reservado temporalmente/);
assert.match(detail, /disabled=\{blocked\}/);
assert.match(detail, /const unverified = product\.availability_status === 'unverified'/);
assert.match(detail, /const blocked = reserved \|\| unverified/);
assert.match(detail, /if \(ownProduct \|\| blocked\) return;/);
assert.match(card, /Disponibilidad por verificar/);
assert.match(card, /reservedForViewer = \(reserved \|\| unverified\)/);
assert.match(detail, /const reserved = product\.availability_status === 'reserved'/);
assert.match(detail, /if \(ownProduct \|\| blocked\) return;/);
const topiQuickReply = detail.split("['¿Sigue disponible?'")[1]?.split("</button>)}</div>", 1)[0];
assert(topiQuickReply, 'Topi suggested-question buttons must exist in ProductDetail');
assert.match(topiQuickReply, /disabled=\{reservedForViewer\}/,
  'Topi shortcut must not create a new chat for a buyer who does not own a reserved listing');
assert.match(topiQuickReply, /onClick=\{\(\) => \{ if \(reservedForViewer\) return; const chatId = contactProduct\(product\.id\)/,
  'Topi shortcut handler must independently enforce reservation gate before contact');

assert.match(store, /product\.availability_status === 'unverified'\) && !existing/);

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
