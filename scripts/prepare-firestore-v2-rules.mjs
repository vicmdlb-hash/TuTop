import fs from 'node:fs';

const sourcePath = 'firebase/firestore.v2.rules';
const outputPath = 'firebase/firestore.v2.generated.rules';
const source = fs.readFileSync(sourcePath, 'utf8');

function requireOnce(input, needle, label) {
  const occurrences = input.split(needle).length - 1;
  if (occurrences !== 1) {
    console.error(`DETENIDO: se esperaba exactamente una ocurrencia de ${label} y se encontraron ${occurrences}.`);
    process.exit(2);
  }
}

function replaceSection(input, startMarker, endMarker, transform, label) {
  const start = input.indexOf(startMarker);
  if (start < 0) {
    console.error(`DETENIDO: no se encontró inicio de sección ${label}.`);
    process.exit(2);
  }
  const end = input.indexOf(endMarker, start);
  if (end < 0) {
    console.error(`DETENIDO: no se encontró fin de sección ${label}.`);
    process.exit(2);
  }
  const section = input.slice(start, end);
  const updated = transform(section);
  if (updated === section) {
    console.error(`DETENIDO: la transformación ${label} no produjo cambios.`);
    process.exit(2);
  }
  return input.slice(0, start) + updated + input.slice(end);
}

const permissiveReputation = "    match /reputation/{uid} { allow read: if signedIn(); allow write: if isAdmin(); }";
const strictReputation = `    match /reputation/{uid} {
      allow read: if signedIn();
      allow create, update: if isAdmin()
        && request.resource.data.keys().hasOnly([
          'subject_uid','completed_transactions','completed_as_seller','completed_as_buyer',
          'seller_review_count','seller_positive_count','seller_positive_rate',
          'buyer_review_count','buyer_positive_count','buyer_positive_rate',
          'cancellations','no_shows','reports_upheld','updated_at'
        ])
        && request.resource.data.subject_uid == uid
        && request.resource.data.completed_transactions is int && request.resource.data.completed_transactions >= 0
        && request.resource.data.completed_as_seller is int && request.resource.data.completed_as_seller >= 0
        && request.resource.data.completed_as_buyer is int && request.resource.data.completed_as_buyer >= 0
        && request.resource.data.completed_transactions == request.resource.data.completed_as_seller + request.resource.data.completed_as_buyer
        && request.resource.data.seller_review_count is int && request.resource.data.seller_review_count >= 0
        && request.resource.data.seller_positive_count is int && request.resource.data.seller_positive_count >= 0
        && request.resource.data.seller_positive_count <= request.resource.data.seller_review_count
        && (
          (request.resource.data.seller_review_count == 0 && request.resource.data.seller_positive_rate == null)
          ||
          (request.resource.data.seller_review_count > 0
            && request.resource.data.seller_positive_rate is number
            && request.resource.data.seller_positive_rate >= 0
            && request.resource.data.seller_positive_rate <= 100)
        )
        && request.resource.data.buyer_review_count is int && request.resource.data.buyer_review_count >= 0
        && request.resource.data.buyer_positive_count is int && request.resource.data.buyer_positive_count >= 0
        && request.resource.data.buyer_positive_count <= request.resource.data.buyer_review_count
        && (
          (request.resource.data.buyer_review_count == 0 && request.resource.data.buyer_positive_rate == null)
          ||
          (request.resource.data.buyer_review_count > 0
            && request.resource.data.buyer_positive_rate is number
            && request.resource.data.buyer_positive_rate >= 0
            && request.resource.data.buyer_positive_rate <= 100)
        )
        && request.resource.data.cancellations is int && request.resource.data.cancellations >= 0
        && request.resource.data.no_shows is int && request.resource.data.no_shows >= 0
        && request.resource.data.reports_upheld is int && request.resource.data.reports_upheld >= 0
        && fresh(request.resource.data.updated_at);
      allow delete: if false;
    }`;

const isAdminLine = "    function isAdmin() { return signedIn() && exists(adminDoc()) && get(adminDoc()).data.active == true; }";
const scopedAdminHelpers = `${isAdminLine}
    function legacyGlobalAdmin() { return isAdmin() && !('role' in get(adminDoc()).data); }
    function adminHasRole(role) { return isAdmin() && ('role' in get(adminDoc()).data) && get(adminDoc()).data.role == role; }
    function globalModerationAdmin() {
      return legacyGlobalAdmin() || adminHasRole('super_admin') || adminHasRole('trust_safety') || adminHasRole('moderator');
    }
    function canReviewVerification() {
      return legacyGlobalAdmin() || adminHasRole('super_admin') || adminHasRole('trust_safety') || adminHasRole('verification_reviewer');
    }
    function canSupportAppeals() {
      return legacyGlobalAdmin() || adminHasRole('super_admin') || adminHasRole('trust_safety') || adminHasRole('support');
    }
    function institutionModeratorFor(data) {
      return adminHasRole('institution_moderator')
        && ('institution_id' in get(adminDoc()).data)
        && ('institution_id' in data)
        && get(adminDoc()).data.institution_id == data.institution_id;
    }
    function canModerateInstitution(data) { return globalModerationAdmin() || institutionModeratorFor(data); }
    function canModerateUser(uid) {
      return globalModerationAdmin() || (
        adminHasRole('institution_moderator')
        && ('institution_id' in get(adminDoc()).data)
        && exists(/databases/$(database)/documents/users/$(uid))
        && ('institution_id' in get(/databases/$(database)/documents/users/$(uid)).data)
        && get(adminDoc()).data.institution_id == get(/databases/$(database)/documents/users/$(uid)).data.institution_id
      );
    }
    function canHandleModerationCase(data) {
      return canModerateInstitution(data)
        || (adminHasRole('verification_reviewer') && ('kind' in data) && data.kind == 'credential')
        || (adminHasRole('support') && ('kind' in data) && data.kind == 'appeal');
    }`;

requireOnce(source, permissiveReputation, 'reputation permisivo');
requireOnce(source, isAdminLine, 'helper isAdmin');

let generated = source.replace(isAdminLine, scopedAdminHelpers).replace(permissiveReputation, strictReputation);

generated = replaceSection(
  generated,
  '    match /verificationRequests/{uid} {',
  '    match /publicVerifications/{uid} {',
  (section) => section
    .replace('allow read: if owner(uid) || isAdmin();', 'allow read: if owner(uid) || canReviewVerification();')
    .replace('        isAdmin()\n', '        canReviewVerification()\n'),
  'verificationRequests scope',
);

generated = replaceSection(
  generated,
  '    match /publicVerifications/{uid} {',
  '    match /reports/{reportId} {',
  (section) => section.replace('allow create, update: if isAdmin()', 'allow create, update: if canReviewVerification()'),
  'publicVerifications scope',
);

generated = replaceSection(
  generated,
  '    match /reports/{reportId} {',
  '    match /moderation_cases/{caseId}',
  (section) => section
    .replace('allow read: if isAdmin() || (signedIn() && resource.data.created_by == request.auth.uid);', 'allow read: if (signedIn() && resource.data.created_by == request.auth.uid) || canModerateInstitution(resource.data);')
    .replace('allow update: if isAdmin()', 'allow update: if canModerateInstitution(resource.data)'),
  'reports institutional scope',
);

const permissiveModeration = '    match /moderation_cases/{caseId} { allow read, write: if isAdmin(); }';
const strictModerationAndPrivacy = `    match /moderation_cases/{caseId} {
      allow read: if canHandleModerationCase(resource.data);
      allow create: if isAdmin()
        && request.resource.data.keys().hasOnly(['kind','target_type','target_id','institution_id','status','priority','assigned_to','evidence_refs','action','reason','internal_notes','result','created_at','updated_at'])
        && request.resource.data.kind in ['credential','product','user','chat','possible_scam','prohibited_content','appeal','urgent_incident']
        && request.resource.data.status in ['open','reviewing','resolved','dismissed']
        && request.resource.data.priority in ['normal','high','urgent']
        && canHandleModerationCase(request.resource.data)
        && fresh(request.resource.data.created_at) && fresh(request.resource.data.updated_at);
      allow update: if canHandleModerationCase(resource.data)
        && request.resource.data.kind == resource.data.kind
        && request.resource.data.target_type == resource.data.target_type
        && request.resource.data.target_id == resource.data.target_id
        && (!('institution_id' in resource.data) || request.resource.data.institution_id == resource.data.institution_id)
        && request.resource.data.status in ['open','reviewing','resolved','dismissed']
        && request.resource.data.priority in ['normal','high','urgent']
        && fresh(request.resource.data.updated_at);
      allow delete: if false;
    }

    match /notification_preferences/{uid} {
      allow read: if owner(uid);
      allow create, update: if owner(uid) && notSuspended()
        && request.resource.data.keys().hasOnly([
          'new_message','offer_received','offer_accepted','counter_offer','reservation_expiring','meetup_reminder',
          'saved_search_match','favorite_price_drop','saved_item_available','followed_seller_new_listing',
          'listing_saved_count','weekly_digest','safety_alert','updated_at'
        ])
        && request.resource.data.new_message is bool
        && request.resource.data.offer_received is bool
        && request.resource.data.offer_accepted is bool
        && request.resource.data.counter_offer is bool
        && request.resource.data.reservation_expiring is bool
        && request.resource.data.meetup_reminder is bool
        && request.resource.data.saved_search_match is bool
        && request.resource.data.favorite_price_drop is bool
        && request.resource.data.saved_item_available is bool
        && request.resource.data.followed_seller_new_listing is bool
        && request.resource.data.listing_saved_count is bool
        && request.resource.data.weekly_digest is bool
        && request.resource.data.safety_alert is bool
        && fresh(request.resource.data.updated_at);
      allow delete: if owner(uid);
    }

    match /account_deletion_requests/{uid} {
      allow read: if owner(uid) || canSupportAppeals();
      allow create: if owner(uid)
        && request.resource.data.keys().hasOnly(['uid','status','requested_at','updated_at'])
        && request.resource.data.uid == uid
        && request.resource.data.status == 'pending'
        && fresh(request.resource.data.requested_at)
        && fresh(request.resource.data.updated_at);
      allow update: if canSupportAppeals()
        && request.resource.data.uid == uid
        && request.resource.data.requested_at == resource.data.requested_at
        && request.resource.data.status in ['pending','processing','completed','rejected']
        && fresh(request.resource.data.updated_at);
      allow delete: if false;
    }

    match /feature_flags/{flagId} {
      allow read: if signedIn();
      allow create, update: if legacyGlobalAdmin() || adminHasRole('super_admin');
      allow delete: if false;
    }`;
requireOnce(generated, permissiveModeration, 'moderation_cases permisivo');
generated = generated.replace(permissiveModeration, strictModerationAndPrivacy);

generated = replaceSection(
  generated,
  '    match /audit_log/{entryId} {',
  '    match /reputation/{uid} {',
  (section) => section
    .replace('allow read: if isAdmin();', "allow read: if globalModerationAdmin() || institutionModeratorFor(resource.data);")
    .replace('allow create: if isAdmin() && request.resource.data.admin_uid == request.auth.uid && fresh(request.resource.data.created_at);', "allow create: if isAdmin() && request.resource.data.admin_uid == request.auth.uid && (globalModerationAdmin() || institutionModeratorFor(request.resource.data)) && fresh(request.resource.data.created_at);"),
  'audit log scope',
);

generated = replaceSection(
  generated,
  '    match /moderationStatus/{uid} {',
  '    match /admins/{uid}',
  (section) => section
    .replace('allow read: if owner(uid) || isAdmin();', 'allow read: if owner(uid) || canModerateUser(uid);')
    .replace('allow create, update: if isAdmin()', 'allow create, update: if canModerateUser(uid)'),
  'moderationStatus scope',
);

fs.writeFileSync(outputPath, generated);
console.log(`✅ Rules V2 generadas con reputation estricto, moderación por alcance y privacidad: ${outputPath}`);
