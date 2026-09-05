import fs from 'node:fs';

const path = 'firebase/firestore.v2.generated.rules';
let rules = fs.readFileSync(path, 'utf8');
const marker = '    match /{document=**} { allow read, write: if false; }';
const count = rules.split(marker).length - 1;
if (count !== 1) {
  console.error(`DETENIDO: runtime rules esperaba 1 catch-all y encontró ${count}.`);
  process.exit(2);
}

const runtimeCollections = `    match /device_tokens/{tokenId} {
      allow read: if signedIn() && resource.data.owner_uid == request.auth.uid;
      allow create: if signedIn() && notSuspended()
        && request.resource.data.keys().hasOnly(['owner_uid','token','platform','app_version','active','created_at','updated_at'])
        && request.resource.data.owner_uid == request.auth.uid
        && request.resource.data.token is string && request.resource.data.token.size() >= 20 && request.resource.data.token.size() <= 4096
        && request.resource.data.platform in ['android','ios','web']
        && request.resource.data.app_version is string && request.resource.data.app_version.size() <= 40
        && request.resource.data.active is bool
        && fresh(request.resource.data.created_at) && fresh(request.resource.data.updated_at);
      allow update: if signedIn() && notSuspended() && resource.data.owner_uid == request.auth.uid
        && request.resource.data.owner_uid == resource.data.owner_uid
        && request.resource.data.created_at == resource.data.created_at
        && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['token','platform','app_version','active','updated_at'])
        && request.resource.data.token is string && request.resource.data.token.size() >= 20 && request.resource.data.token.size() <= 4096
        && request.resource.data.platform in ['android','ios','web']
        && request.resource.data.active is bool
        && fresh(request.resource.data.updated_at);
      allow delete: if signedIn() && resource.data.owner_uid == request.auth.uid;
    }

    match /notification_outbox/{notificationId} {
      allow read: if signedIn() && resource.data.recipient_uid == request.auth.uid;
      allow create, update, delete: if false;
    }

    match /transaction_outcome_claims/{claimId} {
      allow read: if signedIn() && (
        resource.data.claimant_uid == request.auth.uid
        || resource.data.accused_uid == request.auth.uid
        || canModerateInstitution(resource.data)
      );
      allow create: if signedIn() && notSuspended()
        && request.resource.data.keys().hasOnly(['transaction_id','claimant_uid','accused_uid','kind','institution_id','reason','status','created_at','updated_at'])
        && claimId == request.resource.data.transaction_id + '-' + request.auth.uid
        && request.resource.data.claimant_uid == request.auth.uid
        && request.resource.data.accused_uid != request.auth.uid
        && request.resource.data.kind in ['buyer_no_show','seller_no_show']
        && request.resource.data.status == 'open'
        && request.resource.data.reason is string && request.resource.data.reason.size() <= 500
        && exists(/databases/$(database)/documents/transactions_v2/$(request.resource.data.transaction_id))
        && request.auth.uid in [
          get(/databases/$(database)/documents/transactions_v2/$(request.resource.data.transaction_id)).data.buyer_id,
          get(/databases/$(database)/documents/transactions_v2/$(request.resource.data.transaction_id)).data.seller_id
        ]
        && request.resource.data.accused_uid in [
          get(/databases/$(database)/documents/transactions_v2/$(request.resource.data.transaction_id)).data.buyer_id,
          get(/databases/$(database)/documents/transactions_v2/$(request.resource.data.transaction_id)).data.seller_id
        ]
        && request.resource.data.accused_uid != request.resource.data.claimant_uid
        && request.resource.data.institution_id is string
        && request.resource.data.institution_id == listingDoc(get(/databases/$(database)/documents/transactions_v2/$(request.resource.data.transaction_id)).data.listing_id).data.institution_id
        && get(/databases/$(database)/documents/transactions_v2/$(request.resource.data.transaction_id)).data.status == 'meetup_scheduled'
        && get(/databases/$(database)/documents/transactions_v2/$(request.resource.data.transaction_id)).data.meetup_at is timestamp
        && request.time >= get(/databases/$(database)/documents/transactions_v2/$(request.resource.data.transaction_id)).data.meetup_at + duration.value(30, 'm')
        && fresh(request.resource.data.created_at) && fresh(request.resource.data.updated_at);
      allow update: if canModerateInstitution(resource.data)
        && request.resource.data.transaction_id == resource.data.transaction_id
        && request.resource.data.claimant_uid == resource.data.claimant_uid
        && request.resource.data.accused_uid == resource.data.accused_uid
        && request.resource.data.kind == resource.data.kind
        && request.resource.data.institution_id == resource.data.institution_id
        && request.resource.data.created_at == resource.data.created_at
        && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['status','updated_at'])
        && request.resource.data.status in ['open','upheld','dismissed']
        && fresh(request.resource.data.updated_at);
      allow delete: if false;
    }

`;

rules = rules.replace(marker, runtimeCollections + marker);
fs.writeFileSync(path, rules);
console.log('✅ Rules V2 runtime: device tokens privados, notification outbox server-only y claims de no-show protegidos.');
