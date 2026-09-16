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

function replaceOnceInSection(startMarker, endMarker, from, to, label) {
  const start = rules.indexOf(startMarker);
  if (start < 0) {
    console.error(`DETENIDO: ${label} no encontró inicio de sección.`);
    process.exit(2);
  }
  const end = rules.indexOf(endMarker, start);
  if (end < 0) {
    console.error(`DETENIDO: ${label} no encontró fin de sección.`);
    process.exit(2);
  }
  const section = rules.slice(start, end);
  const count = section.split(from).length - 1;
  if (count !== 1) {
    console.error(`DETENIDO: ${label} esperaba 1 coincidencia dentro de su sección y encontró ${count}.`);
    process.exit(2);
  }
  rules = rules.slice(0, start) + section.replace(from, to) + rules.slice(end);
}

const signedIn = `    function signedIn() { return request.auth != null; }`;
const verifiedHelper = `${signedIn}\n    function verifiedIdentity() {\n      return signedIn()\n        && request.auth.token.email is string\n        && request.auth.token.email.size() >= 6\n        && request.auth.token.email_verified == true;\n    }`;
replaceOnce(signedIn, verifiedHelper, 'verified identity helper');

// Private identity: phone-password remains readable for legacy beta users, but
// new verified-email accounts may omit phone and bind institutional_email to the
// Firebase Auth email. Sensitive writes are gated separately below.
const oldPrivateCreate = `      allow create: if owner(uid)\n        && request.resource.data.keys().hasOnly(['uid','telefono','institutional_email','created_at','updated_at','auth_mode'])\n        && request.resource.data.uid == uid\n        && request.resource.data.telefono is string && request.resource.data.telefono.size() >= 11 && request.resource.data.telefono.size() <= 16\n        && (!('institutional_email' in request.resource.data) || (request.resource.data.institutional_email is string && request.resource.data.institutional_email.size() <= 180))\n        && request.resource.data.auth_mode == 'phone_password_beta'\n        && fresh(request.resource.data.created_at)\n        && (!('updated_at' in request.resource.data) || fresh(request.resource.data.updated_at));`;
const newPrivateCreate = `      allow create: if owner(uid)\n        && request.resource.data.keys().hasOnly(['uid','telefono','institutional_email','created_at','updated_at','auth_mode'])\n        && request.resource.data.uid == uid\n        && request.resource.data.auth_mode in ['phone_password_beta','email_password_verified_beta']\n        && (\n          (request.resource.data.auth_mode == 'phone_password_beta'\n            && request.resource.data.telefono is string\n            && request.resource.data.telefono.size() >= 11 && request.resource.data.telefono.size() <= 16)\n          ||\n          (request.resource.data.auth_mode == 'email_password_verified_beta'\n            && request.resource.data.institutional_email is string\n            && request.resource.data.institutional_email == request.auth.token.email\n            && request.resource.data.institutional_email.size() >= 6 && request.resource.data.institutional_email.size() <= 180\n            && (!('telefono' in request.resource.data) || (request.resource.data.telefono is string && request.resource.data.telefono.size() >= 11 && request.resource.data.telefono.size() <= 16)))\n        )\n        && (!('institutional_email' in request.resource.data) || (request.resource.data.institutional_email is string && request.resource.data.institutional_email.size() <= 180))\n        && fresh(request.resource.data.created_at)\n        && (!('updated_at' in request.resource.data) || fresh(request.resource.data.updated_at));`;
replaceOnce(oldPrivateCreate, newPrivateCreate, 'user_private verified-email contract');

const gates = [
  [
    `      allow create: if signedIn() && notSuspended()\n        && request.resource.data.keys().hasOnly([\n          'vendedor_id'`,
    `      allow create: if signedIn() && notSuspended() && verifiedIdentity()\n        && request.resource.data.keys().hasOnly([\n          'vendedor_id'`,
    'legacy product create',
  ],
  [
    `      allow update: if signedIn() && notSuspended() && resource.data.vendedor_id == request.auth.uid`,
    `      allow update: if signedIn() && notSuspended() && verifiedIdentity() && resource.data.vendedor_id == request.auth.uid`,
    'legacy product update',
  ],
  [
    `      allow create: if signedIn() && notSuspended()\n        && rateLimitConsumed('chat_create')`,
    `      allow create: if signedIn() && notSuspended() && verifiedIdentity()\n        && rateLimitConsumed('chat_create')`,
    'chat create',
  ],
  [
    `      allow update: if participant(chatId) && notSuspended()\n        && request.resource.data.participants == resource.data.participants`,
    `      allow update: if participant(chatId) && notSuspended() && verifiedIdentity()\n        && request.resource.data.participants == resource.data.participants`,
    'chat update',
  ],
  [
    `        allow create: if participant(chatId) && notSuspended()\n          && rateLimitConsumed('message_create')`,
    `        allow create: if participant(chatId) && notSuspended() && verifiedIdentity()\n          && rateLimitConsumed('message_create')`,
    'message create',
  ],
  [
    `        allow create: if participant(chatId) && owner(uid) && notSuspended()\n          && request.resource.data.keys().hasOnly(['user_id','created_at'])`,
    `        allow create: if participant(chatId) && owner(uid) && notSuspended() && verifiedIdentity()\n          && request.resource.data.keys().hasOnly(['user_id','created_at'])`,
    'legacy delivery confirmation',
  ],
  [
    `      allow create: if signedIn() && notSuspended()\n        && rateLimitConsumed('offer_create')`,
    `      allow create: if signedIn() && notSuspended() && verifiedIdentity()\n        && rateLimitConsumed('offer_create')`,
    'offer create',
  ],
  [
    `      allow update: if signedIn() && notSuspended()\n        && resource.data.status == 'pending'`,
    `      allow update: if signedIn() && notSuspended() && verifiedIdentity()\n        && resource.data.status == 'pending'`,
    'offer update',
  ],
  [
    `      allow create: if signedIn() && notSuspended()\n        && request.resource.data.keys().hasOnly(['listing_id','chat_id','buyer_id','seller_id','accepted_offer_id'`,
    `      allow create: if signedIn() && notSuspended() && verifiedIdentity()\n        && request.resource.data.keys().hasOnly(['listing_id','chat_id','buyer_id','seller_id','accepted_offer_id'`,
    'transaction create',
  ],
  [
    `      allow create: if signedIn() && notSuspended()\n        && rateLimitConsumed('listing_create')`,
    `      allow create: if signedIn() && notSuspended() && verifiedIdentity()\n        && rateLimitConsumed('listing_create')`,
    'canonical listing create',
  ],
  [
    `      allow update: if signedIn() && notSuspended() && (\n        (\n          request.auth.uid == resource.data.seller_id`,
    `      allow update: if signedIn() && notSuspended() && (\n        (\n          request.auth.uid == resource.data.seller_id\n          && verifiedIdentity()`,
    'canonical listing seller update',
  ],
];

for (const [from, to, label] of gates) replaceOnce(from, to, label);

const transactionUpdate = `      allow update: if signedIn() && notSuspended()\n        && request.auth.uid in [resource.data.buyer_id, resource.data.seller_id]`;
replaceOnceInSection(
  '    match /transactions_v2/{transactionId} {',
  '    match /demand_requests/{requestId} {',
  transactionUpdate,
  `      allow update: if signedIn() && notSuspended() && verifiedIdentity()\n        && request.auth.uid in [resource.data.buyer_id, resource.data.seller_id]`,
  'transactions_v2 verified update',
);

fs.writeFileSync(path, rules);
console.log('✅ Verified-email beta Rules: sensitive marketplace writes require request.auth.token.email_verified == true.');
