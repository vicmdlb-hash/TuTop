import fs from 'node:fs';

const path = 'firebase/firestore.v2.generated.rules';
let rules = fs.readFileSync(path, 'utf8');

function replaceOnce(from, to, label) {
  const count = rules.split(from).length - 1;
  if (count !== 1) {
    console.error(`DETENIDO: ${label} esperaba 1 coincidencia y encontró ${count}.`);
    process.exit(2);
  }
  rules = rules.replace(from, to);
}

// listings_v2 already has a deliberately expensive schema/catalog validation.
// The generic rateLimitConsumed() also validates the bucket in detail, which pushes
// Firestore's evaluator above its 1000-expression ceiling. The bucket document's own
// match rule already validates owner, action, cap, timestamps and one-hour reset.
// At listing-create time we only need to prove that THIS atomic request actually
// changed the deterministic listing bucket. If there is no bucket write, getAfter == get
// and this helper fails. This preserves the non-bypassable property with far fewer expressions.
const usersMarker = '    match /users/{uid} {';
const helper = `    function listingRateLimitConsumed() {
      let bucket = /databases/$(database)/documents/rate_limits/$(request.auth.uid + '-listing_create');
      return existsAfter(bucket)
        && (
          (!exists(bucket) && getAfter(bucket).data.count == 1)
          ||
          (exists(bucket) && (
            getAfter(bucket).data.count == get(bucket).data.count + 1
            || (getAfter(bucket).data.count == 1 && getAfter(bucket).data.window_start != get(bucket).data.window_start)
          ))
        );
    }

${usersMarker}`;
replaceOnce(usersMarker, helper, 'listing lightweight rate helper');
replaceOnce("rateLimitConsumed('listing_create')", 'listingRateLimitConsumed()', 'listing rate helper call');

fs.writeFileSync(path, rules);
console.log('✅ listings_v2 conserva rate limit atómico dentro del presupuesto de expresiones de Firestore.');
