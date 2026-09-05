import fs from 'node:fs';

const sourcePath = 'firebase/firestore.v2.rules';
const outputPath = 'firebase/firestore.v2.generated.rules';
const source = fs.readFileSync(sourcePath, 'utf8');
const permissive = "    match /reputation/{uid} { allow read: if signedIn(); allow write: if isAdmin(); }";
const strict = `    match /reputation/{uid} {
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

const occurrences = source.split(permissive).length - 1;
if (occurrences !== 1) {
  console.error(`DETENIDO: se esperó exactamente un bloque reputation permisivo y se encontraron ${occurrences}.`);
  process.exit(2);
}

const generated = source.replace(permissive, strict);
fs.writeFileSync(outputPath, generated);
console.log(`✅ Rules V2 generadas con schema reputation estricto: ${outputPath}`);
