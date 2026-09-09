import fs from 'node:fs';
import assert from 'node:assert/strict';

const hardener = fs.readFileSync('scripts/harden-canonical-v2-rules.mjs', 'utf8');

function section(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert(from >= 0 && to > from, `missing section: ${start}`);
  return source.slice(from, to);
}

const helper = section(hardener, '    function buyerCompletionClosesListing(listingId)', '    }`');
const buyerRule = section(hardener, 'const buyerCompletionListingRule', '${moderatorListingNeedle}');

const helperGetAfterCalls = (helper.match(/getAfter\(/g) || []).length;
assert.equal(helperGetAfterCalls, 2, 'buyer-second helper must use exactly two explicit getAfter calls: lock + transaction');
assert.match(helper, /let lock = getAfter\([^\n]*listing_reservation_locks/);
assert.match(helper, /let tx = getAfter\([^\n]*transactions_v2\/\$\(lock\.data\.transaction_id\)/);
assert.doesNotMatch(helper, /existsAfter\(/);
assert.doesNotMatch(helper, /listingDoc\(/);
assert.match(helper, /tx\.data\.status == 'completed'/);
assert.match(helper, /tx\.data\.buyer_confirmed_at is timestamp/);
assert.match(helper, /tx\.data\.seller_confirmed_at is timestamp/);
assert.match(helper, /tx\.data\.buyer_confirmed_at == request\.resource\.data\.updated_at/);
assert.match(helper, /tx\.data\.updated_at == request\.resource\.data\.updated_at/);

assert.equal((buyerRule.match(/buyerCompletionClosesListing\(listingId\)/g) || []).length, 1);
assert.doesNotMatch(buyerRule, /getAfter\(|existsAfter\(|reservationLockAfter|completionTxAfter/);

// Each transaction-completion write independently checks the paired listing after-state.
assert.equal((hardener.match(/getAfter\(\/databases\/\$\(database\)\/documents\/listings_v2\/\$\(resource\.data\.listing_id\)\)\.data\.status == 'sold_out'/g) || []).length, 2);

console.log('PASS buyer-second listing authorization has a static two-document access budget (lock + transaction)');
console.log('PASS buyer listing branch delegates to the bounded helper exactly once and performs no extra document access');
console.log('PASS buyer/seller transaction completion each require the paired listing after-state to be sold_out');
console.log('V2 Firestore Rules access-budget contract: PASS');
