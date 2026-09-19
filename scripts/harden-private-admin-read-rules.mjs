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

function replaceCount(from, to, expected, label) {
  const count = rules.split(from).length - 1;
  if (count !== expected) {
    console.error(`DETENIDO: ${label} esperaba ${expected} coincidencias y encontró ${count}.`);
    process.exit(2);
  }
  rules = rules.split(from).join(to);
}

const supportHelper = `    function canSupportAppeals() {
      return adminHasRole('super_admin') || adminHasRole('trust_safety') || adminHasRole('support');
    }`;

replaceOnce(
  supportHelper,
  `${supportHelper}
    function canReadIdentityPrivate() {
      return adminHasRole('super_admin') || adminHasRole('trust_safety') || adminHasRole('verification_reviewer');
    }
    function canReadWalletPrivate() {
      return adminHasRole('super_admin');
    }
    function canReadCommercePrivate() {
      return adminHasRole('super_admin') || adminHasRole('trust_safety');
    }`,
  'private admin read capability helpers',
);

replaceOnce(
  '      allow read: if owner(uid) || isAdmin();',
  '      allow read: if owner(uid) || canReadIdentityPrivate();',
  'user_private identity scope',
);

replaceOnce(
  '      allow read: if owner(uid) || isAdmin();',
  '      allow read: if owner(uid) || canReadWalletPrivate();',
  'wallet scope',
);

replaceOnce(
  '      allow read: if signedIn() && (resource.data.user_id == request.auth.uid || isAdmin());',
  '      allow read: if signedIn() && (resource.data.user_id == request.auth.uid || canReadWalletPrivate());',
  'wallet transaction scope',
);

replaceOnce(
  '      allow read: if signedIn() && (resource.data.uid == request.auth.uid || isAdmin());',
  '      allow read: if signedIn() && resource.data.uid == request.auth.uid;',
  'favorites owner-only scope',
);

replaceOnce(
  '      allow read: if signedIn() && (request.auth.uid in resource.data.participants || isAdmin());',
  '      allow read: if signedIn() && (request.auth.uid in resource.data.participants || canReadCommercePrivate());',
  'chat private read scope',
);

replaceCount(
  '        allow read: if participant(chatId) || isAdmin();',
  '        allow read: if participant(chatId) || canReadCommercePrivate();',
  3,
  'chat nested private read scope',
);

replaceOnce(
  '      allow read: if signedIn() && (request.auth.uid == resource.data.buyer_id || request.auth.uid == resource.data.seller_id || isAdmin());',
  '      allow read: if signedIn() && (request.auth.uid == resource.data.buyer_id || request.auth.uid == resource.data.seller_id || canReadCommercePrivate());',
  'offers private read scope',
);

replaceOnce(
  '      allow read: if signedIn() && (request.auth.uid == resource.data.buyer_id || request.auth.uid == resource.data.seller_id || isAdmin());',
  '      allow read: if signedIn() && (request.auth.uid == resource.data.buyer_id || request.auth.uid == resource.data.seller_id || canReadCommercePrivate());',
  'transactions private read scope',
);

replaceOnce(
  '      allow read: if signedIn() && (resource.data.owner_uid == request.auth.uid || isAdmin());',
  '      allow read: if signedIn() && resource.data.owner_uid == request.auth.uid;',
  'saved searches owner-only scope',
);

replaceOnce(
  '      allow read: if signedIn() && (resource.data.evaluador_id == request.auth.uid || resource.data.evaluado_id == request.auth.uid || isAdmin());',
  '      allow read: if signedIn() && (resource.data.evaluador_id == request.auth.uid || resource.data.evaluado_id == request.auth.uid || canReadCommercePrivate());',
  'reviews private read scope',
);

replaceOnce(
  `      allow read: if signedIn() && (
        request.auth.uid in [resource.data.buyer_id, resource.data.seller_id]
        || isAdmin()
      );`,
  `      allow read: if signedIn() && (
        request.auth.uid in [resource.data.buyer_id, resource.data.seller_id]
        || canReadCommercePrivate()
      );`,
  'reservation lock private read scope',
);

replaceOnce(
  '    match /admins/{uid} { allow read: if owner(uid) || isAdmin(); allow write: if false; }',
  "    match /admins/{uid} { allow read: if owner(uid) || adminHasRole('super_admin'); allow write: if false; }",
  'admin inventory read scope',
);

fs.writeFileSync(path, rules);
console.log('✅ Private admin reads use explicit least-privilege capabilities; generic isAdmin() removed from targeted private read surfaces.');
