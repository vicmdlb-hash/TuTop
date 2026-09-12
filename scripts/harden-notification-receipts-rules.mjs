import fs from 'node:fs';

const path = 'firebase/firestore.v2.generated.rules';
let rules = fs.readFileSync(path, 'utf8');
const marker = `    match /notification_outbox/{notificationId} {
      allow read: if signedIn() && resource.data.recipient_uid == request.auth.uid;
      allow create, update, delete: if false;
    }
`;
const replacement = `${marker}
    match /notification_receipts/{receiptId} {
      allow read: if signedIn() && resource.data.owner_uid == request.auth.uid;
      allow create: if signedIn() && notSuspended()
        && request.resource.data.keys().hasOnly(['owner_uid','notification_id','read_at','created_at','updated_at'])
        && request.resource.data.owner_uid == request.auth.uid
        && request.resource.data.notification_id is string
        && request.resource.data.notification_id.size() >= 2
        && request.resource.data.notification_id.size() <= 180
        && receiptId == request.auth.uid + '-' + request.resource.data.notification_id
        && exists(/databases/$(database)/documents/notification_outbox/$(request.resource.data.notification_id))
        && get(/databases/$(database)/documents/notification_outbox/$(request.resource.data.notification_id)).data.recipient_uid == request.auth.uid
        && fresh(request.resource.data.read_at)
        && fresh(request.resource.data.created_at)
        && fresh(request.resource.data.updated_at);
      allow update: if signedIn() && notSuspended()
        && resource.data.owner_uid == request.auth.uid
        && request.resource.data.owner_uid == resource.data.owner_uid
        && request.resource.data.notification_id == resource.data.notification_id
        && request.resource.data.created_at == resource.data.created_at
        && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['read_at','updated_at'])
        && fresh(request.resource.data.read_at)
        && fresh(request.resource.data.updated_at);
      allow delete: if signedIn() && resource.data.owner_uid == request.auth.uid;
    }
`;
const count = rules.split(marker).length - 1;
if (count !== 1) {
  console.error(`DETENIDO: notification receipt hardener esperaba 1 coincidencia y encontró ${count}.`);
  process.exit(2);
}
rules = rules.replace(marker, replacement);
fs.writeFileSync(path, rules);
console.log('✅ Notification receipts privados y vinculados al outbox trusted.');
