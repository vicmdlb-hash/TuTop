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

const agreedAmount = "        && request.resource.data.agreed_amount_mxn == getAfter(/databases/$(database)/documents/offers/$(request.resource.data.accepted_offer_id)).data.amount_mxn";
replaceOnce(
  agreedAmount,
  `${agreedAmount}\n        && existsAfter(/databases/$(database)/documents/listing_reservation_locks/$(request.resource.data.listing_id))\n        && getAfter(/databases/$(database)/documents/listing_reservation_locks/$(request.resource.data.listing_id)).data.transaction_id == transactionId\n        && getAfter(/databases/$(database)/documents/listing_reservation_locks/$(request.resource.data.listing_id)).data.buyer_id == request.resource.data.buyer_id\n        && getAfter(/databases/$(database)/documents/listing_reservation_locks/$(request.resource.data.listing_id)).data.seller_id == request.resource.data.seller_id`,
  'transaction create requires unique reservation lock',
);

const expiryNeedle = `            && request.resource.data.status == 'expired'\n            && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['status','updated_at'])`;
replaceOnce(
  expiryNeedle,
  `${expiryNeedle}\n            && !existsAfter(/databases/$(database)/documents/listing_reservation_locks/$(resource.data.listing_id))`,
  'expiry releases reservation lock',
);

const cancelNeedle = `        && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['status','outcome_code','outcome_actor_id','outcome_recorded_at','updated_at']);`;
replaceOnce(
  cancelNeedle,
  `        && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['status','outcome_code','outcome_actor_id','outcome_recorded_at','updated_at'])\n        && !existsAfter(/databases/$(database)/documents/listing_reservation_locks/$(resource.data.listing_id));`,
  'cancellation releases reservation lock',
);

const demandMarker = '    match /demand_requests/{requestId} {';
const lockRules = `    match /listing_reservation_locks/{listingId} {\n      allow read: if signedIn() && (\n        request.auth.uid in [resource.data.buyer_id, resource.data.seller_id]\n        || isAdmin()\n      );\n      allow create: if signedIn() && notSuspended()\n        && request.resource.data.keys().hasOnly(['listing_id','transaction_id','buyer_id','seller_id','created_at','updated_at'])\n        && request.resource.data.listing_id == listingId\n        && request.auth.uid == request.resource.data.seller_id\n        && request.resource.data.buyer_id != request.resource.data.seller_id\n        && request.resource.data.transaction_id is string\n        && request.resource.data.transaction_id.size() >= 5\n        && request.resource.data.transaction_id.size() <= 180\n        && existsAfter(/databases/$(database)/documents/transactions_v2/$(request.resource.data.transaction_id))\n        && getAfter(/databases/$(database)/documents/transactions_v2/$(request.resource.data.transaction_id)).data.status == 'reserved'\n        && getAfter(/databases/$(database)/documents/transactions_v2/$(request.resource.data.transaction_id)).data.listing_id == listingId\n        && getAfter(/databases/$(database)/documents/transactions_v2/$(request.resource.data.transaction_id)).data.buyer_id == request.resource.data.buyer_id\n        && getAfter(/databases/$(database)/documents/transactions_v2/$(request.resource.data.transaction_id)).data.seller_id == request.resource.data.seller_id\n        && listingDoc(listingId).data.seller_id == request.resource.data.seller_id\n        && listingDoc(listingId).data.status == 'active'\n        && listingDoc(listingId).data.moderation_status == 'approved'\n        && fresh(request.resource.data.created_at)\n        && fresh(request.resource.data.updated_at);\n      allow update: if false;\n      allow delete: if signedIn()\n        && request.auth.uid in [resource.data.buyer_id, resource.data.seller_id]\n        && existsAfter(/databases/$(database)/documents/transactions_v2/$(resource.data.transaction_id))\n        && getAfter(/databases/$(database)/documents/transactions_v2/$(resource.data.transaction_id)).data.listing_id == listingId\n        && getAfter(/databases/$(database)/documents/transactions_v2/$(resource.data.transaction_id)).data.status in ['cancelled','expired'];\n    }\n\n`;
replaceOnce(demandMarker, lockRules + demandMarker, 'reservation lock collection');

fs.writeFileSync(path, rules);
console.log('✅ Reservation lock V2: una sola transacción activa por listing; cancelación/expiración liberan el lock atómicamente.');
