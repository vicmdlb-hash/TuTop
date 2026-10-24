import fs from 'node:fs';

// This is a DEMO-ONLY strict candidate. Never update firebase.v2.json or
// production/staging with this artifact. The current real-user migration and
// trusted issuance service have NOT been implemented.
if (process.env.GCLOUD_PROJECT !== 'demo-tutop-post120-rules'
  || process.env.FIREBASE_PROJECT_ID !== 'demo-tutop-post120-rules') {
  throw new Error('GUARDIAN_DEMO_ONLY_PROJECT_REQUIRED');
}
const inputPath = 'firebase/firestore.v2.generated.rules';
const outputPath = 'firebase/firestore.v2.guardian-demo.rules';
let rules = fs.readFileSync(inputPath, 'utf8');

function exactlyOne(scope, token, name) {
  const count = scope.split(token).length - 1;
  if (count !== 1) throw new Error('GUARDIAN_DEMO_MARKER_DRIFT ' + name + ': ' + count);
}

const signedIn = '    function signedIn() { return request.auth != null; }';
exactlyOne(rules, signedIn, 'signedIn');
const helpers = `
    // The data below MUST come from an authenticated privileged issuer.
    // Firestore clients cannot write the proof collections (base V2 Rules).
    // Field mapping to the pure TS policy: expires_at -> expiresAtMs.
    function guardianAgeDoc(uid) {
      return /databases/$(database)/documents/age_proofs_v2/$(uid);
    }
    function guardianGrantDoc(uid) {
      return /databases/$(database)/documents/guardian_grants_v2/$(uid);
    }
    function guardianVerifiedAge(uid) {
      return signedIn() && uid is string && uid.size() > 0
        && exists(guardianAgeDoc(uid))
        && get(guardianAgeDoc(uid)).data.keys().hasAll([
          'subjectUid','band','issuer','revoked','expires_at'
        ])
        && get(guardianAgeDoc(uid)).data.subjectUid == uid
        && get(guardianAgeDoc(uid)).data.issuer == 'trusted_server'
        && get(guardianAgeDoc(uid)).data.revoked == false
        && get(guardianAgeDoc(uid)).data.expires_at is timestamp
        && get(guardianAgeDoc(uid)).data.expires_at > request.time
        && get(guardianAgeDoc(uid)).data.band in ['under_13','teen_13_17','adult'];
    }
    function guardianAdultOrTeen(uid) {
      return guardianVerifiedAge(uid)
        && get(guardianAgeDoc(uid)).data.band in ['adult','teen_13_17'];
    }
    function guardianValidGrant(uid, cap) {
      return exists(guardianGrantDoc(uid))
        && get(guardianGrantDoc(uid)).data.keys().hasAll([
          'childUid','guardianUid','issuer','active','consentVersion',
          'approvedCapabilities','expires_at'
        ])
        && get(guardianGrantDoc(uid)).data.childUid == uid
        && get(guardianGrantDoc(uid)).data.guardianUid is string
        && get(guardianGrantDoc(uid)).data.guardianUid.size() > 0
        && get(guardianGrantDoc(uid)).data.guardianUid != uid
        && get(guardianGrantDoc(uid)).data.issuer == 'trusted_server'
        && get(guardianGrantDoc(uid)).data.active == true
        && get(guardianGrantDoc(uid)).data.consentVersion is string
        && get(guardianGrantDoc(uid)).data.consentVersion.size() > 0
        && get(guardianGrantDoc(uid)).data.expires_at is timestamp
        && get(guardianGrantDoc(uid)).data.expires_at > request.time
        && get(guardianGrantDoc(uid)).data.approvedCapabilities is list
        && cap in get(guardianGrantDoc(uid)).data.approvedCapabilities;
    }
    function guardianCanPublish(uid) {
      return guardianVerifiedAge(uid)
        && (get(guardianAgeDoc(uid)).data.band in ['adult','teen_13_17']
          || (get(guardianAgeDoc(uid)).data.band == 'under_13'
            && guardianValidGrant(uid, 'publish_listing')));
    }
`;
rules = rules.replace(signedIn, signedIn + helpers);

function guardSection(start, end, old, guard, name) {
  const first = rules.indexOf(start);
  const last = rules.indexOf(end, first + start.length);
  if (first < 0 || last < 0 || rules.indexOf(start, first + 1) >= 0) {
    throw new Error('GUARDIAN_DEMO_SECTION_DRIFT ' + name);
  }
  const section = rules.slice(first, last);
  exactlyOne(section, old, name);
  rules = rules.slice(0, first) + section.replace(old, old.replace(/^(allow (?:create|update): if [^\n]+)/, '$1 && ' + guard)) + rules.slice(last);
}

guardSection('    match /listings_v2/{listingId} {', '    match /offers/{offerId} {',
  'allow create: if signedIn() && notSuspended()',
  'guardianCanPublish(request.auth.uid)', 'listing create');
guardSection('    match /chats/{chatId} {', '    match /listings_v2/{listingId} {',
  'allow create: if signedIn() && notSuspended()',
  'guardianAdultOrTeen(request.auth.uid) && guardianAdultOrTeen(request.resource.data.seller_id)',
  'chat create');
guardSection('    match /chats/{chatId} {', '    match /listings_v2/{listingId} {',
  'allow update: if participant(chatId) && notSuspended()',
  'guardianAdultOrTeen(request.auth.uid) && guardianAdultOrTeen(resource.data.buyer_id) && guardianAdultOrTeen(resource.data.seller_id)',
  'chat update');
guardSection('      match /messages/{messageId} {', '      match /confirmations/{uid} {',
  'allow create: if participant(chatId) && notSuspended()',
  'guardianAdultOrTeen(request.auth.uid) && guardianAdultOrTeen(chatDoc(chatId).data.buyer_id) && guardianAdultOrTeen(chatDoc(chatId).data.seller_id)',
  'message create');
guardSection('    match /offers/{offerId} {', '    match /transactions_v2/{transactionId} {',
  'allow create: if signedIn() && notSuspended()',
  'guardianAdultOrTeen(request.resource.data.buyer_id) && guardianAdultOrTeen(request.resource.data.seller_id)',
  'offer create');
guardSection('    match /offers/{offerId} {', '    match /transactions_v2/{transactionId} {',
  'allow update: if signedIn() && notSuspended()',
  'guardianAdultOrTeen(resource.data.buyer_id) && guardianAdultOrTeen(resource.data.seller_id)',
  'offer update');
guardSection('    match /transactions_v2/{transactionId} {', '    match /demand_requests/{requestId} {',
  "allow create: if signedIn() && notSuspended()\\n        && request.resource.data.keys().hasOnly(['listing_id','chat_id'",
  'guardianAdultOrTeen(request.resource.data.buyer_id) && guardianAdultOrTeen(request.resource.data.seller_id)',
  'transaction create');
guardSection('    match /transactions_v2/{transactionId} {', '    match /demand_requests/{requestId} {',
  "allow update: if signedIn() && notSuspended()\\n        && request.auth.uid in [resource.data.buyer_id, resource.data.seller_id]",
  'guardianAdultOrTeen(resource.data.buyer_id) && guardianAdultOrTeen(resource.data.seller_id)',
  'transaction update');

fs.writeFileSync(outputPath, rules);
console.log('GUARDIAN_DEMO_RULES_PREPARED; no deploy; strict migration probe only');
