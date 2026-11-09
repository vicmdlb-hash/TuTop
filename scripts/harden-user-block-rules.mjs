import fs from 'node:fs';

const path = 'firebase/firestore.v2.generated.rules';
let rules = fs.readFileSync(path, 'utf8');
function replaceOnce(needle, replacement, label) {
  const count = rules.split(needle).length - 1;
  if (count !== 1) {
    console.error(`DETENIDO: user block ${label} esperaba 1 coincidencia y encontró ${count}.`);
    process.exit(2);
  }
  rules = rules.replace(needle, replacement);
}
function patchSection(start, end, before, after, label) {
  const a = rules.indexOf(start);
  const b = rules.indexOf(end, a + start.length);
  if (a < 0 || b <= a) { console.error('DETENIDO: user block sección ' + label); process.exit(2); }
  const current = rules.slice(a, b);
  if (current.split(before).length !== 2) { console.error('DETENIDO: user block ancla ' + label); process.exit(2); }
  rules = rules.slice(0, a) + current.replace(before, after) + rules.slice(b);
}

replaceOnce(
  '    function owner(uid) { return signedIn() && request.auth.uid == uid; }',
  `    function owner(uid) { return signedIn() && request.auth.uid == uid; }
    function usersUnblocked(uidA, uidB) {
      return uidA != uidB
        && !exists(/databases/$(database)/documents/user_blocks/$(uidA)/targets/$(uidB))
        && !exists(/databases/$(database)/documents/user_blocks/$(uidB)/targets/$(uidA));
    }`,
  'helper',
);
const marker = '    match /chats/{chatId} {';
const blockCollection = `    // Owner-only private unilateral block; two-sided effect on communication writes.
    match /user_blocks/{blockerUid}/targets/{blockedUid} {
      allow read: if owner(blockerUid);
      allow create: if owner(blockerUid) && notSuspended()
        && blockedUid != blockerUid && blockedUid.size() >= 1 && blockedUid.size() <= 128
        && request.resource.data.keys().hasOnly(['blocker_uid','blocked_uid','created_at'])
        && request.resource.data.blocker_uid == blockerUid
        && request.resource.data.blocked_uid == blockedUid
        && fresh(request.resource.data.created_at);
      allow update: if false;
      allow delete: if owner(blockerUid);
    }

`;
replaceOnce(marker, blockCollection + marker, 'collection');
patchSection(marker, '    match /offers/{offerId} {',
  '        && request.resource.data.seller_id != request.auth.uid',
  '        && request.resource.data.seller_id != request.auth.uid\n        && usersUnblocked(request.resource.data.buyer_id, request.resource.data.seller_id)', 'chat create');
patchSection(marker, '    match /offers/{offerId} {',
  '      allow update: if participant(chatId) && notSuspended()',
  '      allow update: if participant(chatId) && notSuspended()\n        && usersUnblocked(resource.data.buyer_id, resource.data.seller_id)', 'chat update');
patchSection(marker, '    match /offers/{offerId} {',
  '        allow create: if participant(chatId) && notSuspended()',
  '        allow create: if participant(chatId) && notSuspended()\n          && usersUnblocked(chatDoc(chatId).data.buyer_id, chatDoc(chatId).data.seller_id)', 'messages create');
patchSection('    match /offers/{offerId} {', '    match /transactions_v2/{transactionId} {',
  '        && request.resource.data.buyer_id != request.resource.data.seller_id',
  '        && request.resource.data.buyer_id != request.resource.data.seller_id\n        && usersUnblocked(request.resource.data.buyer_id, request.resource.data.seller_id)', 'offer create');
patchSection('    match /offers/{offerId} {', '    match /transactions_v2/{transactionId} {',
  "        && resource.data.status == 'pending'",
  "        && resource.data.status == 'pending'\n        && (request.resource.data.status in ['withdrawn','rejected'] || usersUnblocked(resource.data.buyer_id, resource.data.seller_id))",
  'offer update retains withdrawals/rejections');

// Apply P01 erasure admission LAST: verified-email generation and user-block
// policy are already in place, so their exact marker invariants stay intact.
// This does not authorize trusted/Admin writers or destructive erasure apply.
replaceOnce(
  "      allow create: if signedIn() && notSuspended() && verifiedIdentity()\n        && rateLimitConsumed('offer_create')",
  "      allow create: if signedIn() && notSuspended() && verifiedIdentity()\n        && commerceAccountsEligible(request.resource.data.buyer_id, request.resource.data.seller_id)\n        && rateLimitConsumed('offer_create')",
  'offer buyer/seller erasure create admission',
);
replaceOnce(
  "      allow update: if signedIn() && notSuspended() && verifiedIdentity()\n        && resource.data.status == 'pending'",
  "      allow update: if signedIn() && notSuspended() && verifiedIdentity()\n        && commerceAccountsEligible(resource.data.buyer_id, resource.data.seller_id)\n        && resource.data.status == 'pending'",
  'offer buyer/seller erasure update admission',
);

// Firestore evaluates the expensive canonical offer predicate and erasure
// lookups against a 1,000-expression cap. The rate_limits document's own Rules
// enforce owner, action, cap, timing and increment; here prove that this atomic
// offer commit changed its deterministic bucket. Mirrors the existing listing
// lightweight rate-limit proof without weakening that bucket's own Rules.
replaceOnce(
  '    match /users/{uid} {',
  `    function offerRateLimitConsumed() {
      let bucket = /databases/$(database)/documents/rate_limits/$(request.auth.uid + '-offer_create');
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

    match /users/{uid} {`,
  'offer lightweight atomic rate helper',
);
replaceOnce(
  "        && commerceAccountsEligible(request.resource.data.buyer_id, request.resource.data.seller_id)\n        && rateLimitConsumed('offer_create')",
  "        && commerceAccountsEligible(request.resource.data.buyer_id, request.resource.data.seller_id)\n        && offerRateLimitConsumed()",
  'offer create lightweight rate helper',
);

fs.writeFileSync(path, rules);
console.log('PASS owner-private user blocks and bilateral write denial for chat, messages, offers; existing reads, cancellations and offer withdrawals remain separate.');
