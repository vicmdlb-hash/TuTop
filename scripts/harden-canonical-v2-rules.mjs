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

replaceOnce(
  "    function productDoc(productId) { return get(/databases/$(database)/documents/products/$(productId)); }",
  `    function listingDoc(listingId) { return get(/databases/$(database)/documents/listings_v2/$(listingId)); }
    function reservationLockAfter(listingId) { return getAfter(/databases/$(database)/documents/listing_reservation_locks/$(listingId)); }
    function completionTxAfter(listingId) {
      let txId = reservationLockAfter(listingId).data.transaction_id;
      return getAfter(/databases/$(database)/documents/transactions_v2/$(txId));
    }`,
  'replace legacy productDoc with canonical listing helpers',
);

replaceOnce(
  "          && request.resource.data.moderation_status == resource.data.moderation_status",
  "          && (\n            request.resource.data.moderation_status == resource.data.moderation_status\n            || (request.resource.data.moderation_status == 'pending' && resource.data.moderation_status in ['approved','rejected','flagged'])\n          )",
  'seller edit returns canonical listing to moderation without self-approval',
);

const moderatorListingNeedle = `        ||
        (
          canModerateInstitution(resource.data)
          && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['moderation_status','updated_at'])`;
const buyerCompletionListingRule = `        ||
        (
          request.auth.uid != resource.data.seller_id
          && resource.data.status == 'active'
          && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['status','updated_at'])
          && request.resource.data.status == 'sold_out'
          && request.resource.data.seller_id == resource.data.seller_id
          && request.resource.data.created_at == resource.data.created_at
          && request.resource.data.moderation_status == resource.data.moderation_status
          && existsAfter(/databases/$(database)/documents/listing_reservation_locks/$(listingId))
          && reservationLockAfter(listingId).data.listing_id == listingId
          && reservationLockAfter(listingId).data.buyer_id == request.auth.uid
          && reservationLockAfter(listingId).data.seller_id == resource.data.seller_id
          && completionTxAfter(listingId).data.listing_id == listingId
          && completionTxAfter(listingId).data.buyer_id == request.auth.uid
          && completionTxAfter(listingId).data.seller_id == resource.data.seller_id
          && completionTxAfter(listingId).data.status == 'completed'
          && completionTxAfter(listingId).data.buyer_confirmed_at is timestamp
          && completionTxAfter(listingId).data.seller_confirmed_at is timestamp
          && completionTxAfter(listingId).data.buyer_confirmed_at == request.resource.data.updated_at
          && completionTxAfter(listingId).data.updated_at == request.resource.data.updated_at
          && fresh(request.resource.data.updated_at)
        )
${moderatorListingNeedle}`;
replaceOnce(moderatorListingNeedle, buyerCompletionListingRule, 'buyer-second completion may only close its exact canonical listing atomically');

replaceOnce(
  "        && getAfter(/databases/$(database)/documents/products/$(offerData.listing_id)).data.estado == 'Reservado';",
  "        && getAfter(/databases/$(database)/documents/listings_v2/$(offerData.listing_id)).data.status == 'active'\n        && getAfter(/databases/$(database)/documents/listings_v2/$(offerData.listing_id)).data.moderation_status == 'approved';",
  'seller acceptance no longer reserves listing',
);

replaceOnce(
  "        && exists(/databases/$(database)/documents/products/$(request.resource.data.product_id))",
  "        && exists(/databases/$(database)/documents/listings_v2/$(request.resource.data.product_id))\n        && listingDoc(request.resource.data.product_id).data.status == 'active'\n        && listingDoc(request.resource.data.product_id).data.moderation_status == 'approved'",
  'favorites use canonical listing',
);

replaceOnce(
  "        && productDoc(request.resource.data.product_id).data.vendedor_id == request.resource.data.seller_id\n        && productDoc(request.resource.data.product_id).data.estado in ['Activo','Reservado']",
  "        && listingDoc(request.resource.data.product_id).data.seller_id == request.resource.data.seller_id\n        && listingDoc(request.resource.data.product_id).data.status == 'active'\n        && listingDoc(request.resource.data.product_id).data.moderation_status == 'approved'",
  'chat create uses canonical listing',
);

replaceOnce(
  "        && productDoc(request.resource.data.listing_id).data.vendedor_id == request.resource.data.seller_id\n        && productDoc(request.resource.data.listing_id).data.estado == 'Activo'",
  "        && listingDoc(request.resource.data.listing_id).data.seller_id == request.resource.data.seller_id\n        && listingDoc(request.resource.data.listing_id).data.status == 'active'\n        && listingDoc(request.resource.data.listing_id).data.moderation_status == 'approved'",
  'offers use canonical listing',
);

replaceOnce(
  "            && get(/databases/$(database)/documents/approved_meeting_points/$(request.resource.data.meeting_point_id)).data.campus_id == productDoc(resource.data.listing_id).data.campus_id",
  "            && get(/databases/$(database)/documents/approved_meeting_points/$(request.resource.data.meeting_point_id)).data.campus_id == listingDoc(resource.data.listing_id).data.campus_id",
  'meetup campus uses canonical listing',
);

replaceOnce(
  "        && productDoc(request.resource.data.product_id).data.vendedor_id == request.auth.uid\n        && productDoc(request.resource.data.product_id).data.estado == 'Activo'\n        && request.resource.data.facultad == productDoc(request.resource.data.product_id).data.facultad\n        && request.resource.data.categoria == productDoc(request.resource.data.product_id).data.categoria",
  "        && listingDoc(request.resource.data.product_id).data.seller_id == request.auth.uid\n        && listingDoc(request.resource.data.product_id).data.status == 'active'\n        && listingDoc(request.resource.data.product_id).data.moderation_status == 'approved'\n        && request.resource.data.facultad is string && request.resource.data.facultad.size() <= 120\n        && request.resource.data.categoria is string && request.resource.data.categoria.size() <= 120",
  'boost bids authorize against canonical listing',
);

replaceOnce(
  "        && exists(/databases/$(database)/documents/chats/$(request.resource.data.chat_id)/confirmations/$(chatDoc(request.resource.data.chat_id).data.buyer_id))\n        && exists(/databases/$(database)/documents/chats/$(request.resource.data.chat_id)/confirmations/$(chatDoc(request.resource.data.chat_id).data.seller_id))",
  "        && 'transaction_id' in chatDoc(request.resource.data.chat_id).data\n        && exists(/databases/$(database)/documents/transactions_v2/$(chatDoc(request.resource.data.chat_id).data.transaction_id))\n        && get(/databases/$(database)/documents/transactions_v2/$(chatDoc(request.resource.data.chat_id).data.transaction_id)).data.status == 'completed'\n        && get(/databases/$(database)/documents/transactions_v2/$(chatDoc(request.resource.data.chat_id).data.transaction_id)).data.chat_id == request.resource.data.chat_id\n        && get(/databases/$(database)/documents/transactions_v2/$(chatDoc(request.resource.data.chat_id).data.transaction_id)).data.buyer_confirmed_at is timestamp\n        && get(/databases/$(database)/documents/transactions_v2/$(chatDoc(request.resource.data.chat_id).data.transaction_id)).data.seller_confirmed_at is timestamp",
  'reviews require completed V2 transaction',
);

const buyerCompletionNeedle = "              (('seller_confirmed_at' in resource.data) && request.resource.data.status == 'completed')";
replaceOnce(
  buyerCompletionNeedle,
  "              (('seller_confirmed_at' in resource.data)\n                && request.resource.data.status == 'completed'\n                && getAfter(/databases/$(database)/documents/listings_v2/$(resource.data.listing_id)).data.status == 'sold_out')",
  'buyer-second completion atomically sells canonical listing',
);

const sellerCompletionNeedle = "              (('buyer_confirmed_at' in resource.data) && request.resource.data.status == 'completed')";
replaceOnce(
  sellerCompletionNeedle,
  "              (('buyer_confirmed_at' in resource.data)\n                && request.resource.data.status == 'completed'\n                && getAfter(/databases/$(database)/documents/listings_v2/$(resource.data.listing_id)).data.status == 'sold_out')",
  'seller-second completion atomically sells canonical listing',
);

if (rules.includes('productDoc(')) {
  console.error('DETENIDO: quedó una referencia legacy productDoc en las Rules V2 generadas.');
  process.exit(2);
}

fs.writeFileSync(path, rules);
console.log('✅ Rules V2 endurecidas: listing canónico para edición/re-moderación, favoritos, chat, ofertas, boosts, meetup, completion bilateral atómico y reseñas; sin helper legacy productDoc.');
