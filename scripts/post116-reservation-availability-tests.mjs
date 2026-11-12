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

console.log('PASS reservation availability truth is public-safe, atomic with lock lifecycle and blocks new buyer actions while reserved');
