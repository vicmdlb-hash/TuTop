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

// Generated account-deletion Rules must retain BOTH narrow flows:
// 1. the owner may only re-open a previously rejected request;
// 2. support may process/reject, never mark completed from a client.
const ownerReRequest = `        (owner(uid)
          && resource.data.status == 'rejected'
          && request.resource.data.uid == uid
          && request.resource.data.status == 'pending'
          && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['status','requested_at','updated_at'])
          && request.resource.data.requested_at is timestamp
          && request.resource.data.requested_at >= resource.data.requested_at
          && fresh(request.resource.data.requested_at)
          && fresh(request.resource.data.updated_at))`;
const trustedProcessorOnlyCompletion = `        (canSupportAppeals()
          && request.resource.data.uid == uid
          && request.resource.data.requested_at == resource.data.requested_at
          && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['status','updated_at'])
          && (
            (resource.data.status == 'pending' && request.resource.data.status in ['processing','rejected'])
            || (resource.data.status == 'processing' && request.resource.data.status == 'rejected')
          )
          && fresh(request.resource.data.updated_at))`;
for (const [needle, label] of [
  [ownerReRequest, 'owner rejected-only renewal'],
  [trustedProcessorOnlyCompletion, 'account deletion trusted-completion'],
]) {
  const count = rules.split(needle).length - 1;
  if (count !== 1) {
    console.error(`DETENIDO: ${label} esperaba 1 coincidencia y encontró ${count}.`);
    process.exit(2);
  }
}
const deletionStart = rules.indexOf('    match /account_deletion_requests/{uid} {');
const deletionEnd = rules.indexOf('    match /feature_flags/{flagId} {', deletionStart);
const deletionRule = rules.slice(deletionStart, deletionEnd);
if (deletionStart < 0 || deletionEnd < deletionStart
  || !deletionRule.includes('allow update: if (')
  || !deletionRule.includes('allow delete: if false;')
  || /request\.resource\.data\.status\s*==\s*'completed'/.test(deletionRule)) {
  console.error('DETENIDO: client account deletion cannot be completed via Rules.');
  process.exit(2);
}

replaceOnce(
  '      allow read: if globalModerationAdmin() || institutionModeratorFor(resource.data);',
  "      allow read: if globalModerationAdmin() || institutionModeratorFor(resource.data) || (canSupportAppeals() && ('target_type' in resource.data) && resource.data.target_type == 'account_deletion_request');",
  'support deletion audit read scope',
);

replaceOnce(
  "      allow create: if isAdmin() && request.resource.data.admin_uid == request.auth.uid && (globalModerationAdmin() || institutionModeratorFor(request.resource.data)) && fresh(request.resource.data.created_at);",
  "      allow create: if isAdmin() && request.resource.data.admin_uid == request.auth.uid && (globalModerationAdmin() || institutionModeratorFor(request.resource.data) || (canSupportAppeals() && ('target_type' in request.resource.data) && request.resource.data.target_type == 'account_deletion_request')) && fresh(request.resource.data.created_at);",
  'support deletion audit create scope',
);

// P01: an offer/counteroffer must not start or change while EITHER party has
// an active erasure request. A rejected request is the only resumable state.
// This is a client Rules admission guard, NOT privileged-server transaction proof.
replaceOnce(
  "      allow create: if signedIn() && notSuspended()\n        && rateLimitConsumed('offer_create')",
  "      allow create: if signedIn() && notSuspended()\n        && commerceAccountsEligible(request.resource.data.buyer_id, request.resource.data.seller_id)\n        && rateLimitConsumed('offer_create')",
  'offers create buyer+seller erasure admission',
);
replaceOnce(
  "      allow update: if signedIn() && notSuspended()\n        && resource.data.status == 'pending'",
  "      allow update: if signedIn() && notSuspended()\n        && commerceAccountsEligible(resource.data.buyer_id, resource.data.seller_id)\n        && resource.data.status == 'pending'",
  'offers update buyer+seller erasure admission',
);

fs.writeFileSync(path, rules);
console.log('✅ Account operations rules: completion reservada al trusted runner + auditoría limitada a solicitudes de eliminación.');
