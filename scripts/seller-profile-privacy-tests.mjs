import assert from 'node:assert/strict';
import fs from 'node:fs';

const profile = fs.readFileSync('src/components/SellerPublicProfile.tsx', 'utf8');
const detail = fs.readFileSync('src/components/ProductDetail.tsx', 'utf8');
const card = fs.readFileSync('src/components/ProductCard.tsx', 'utf8');

assert.match(profile, /sellerReputationEvidence/);
assert.match(profile, /product\.vendedor_id === sellerId && product\.estado === 'Activo'/);
assert.match(profile, /No publica teléfono, correo ni credenciales del vendedor/);
assert.match(detail, /SellerPublicProfile/);
assert.match(detail, /sellerReputationEvidence/);
assert.match(card, /sellerReputationEvidence/);

for (const forbidden of [
  /user_private/,
  /institutional_email/,
  /verificationRequests/,
  /image_data/,
  /\.telefono\b/,
]) {
  assert.doesNotMatch(profile, forbidden);
}

console.log('PASS public seller profile uses shared evidence');
console.log('PASS public seller profile exposes active listings only');
console.log('PASS public seller profile does not reference private identity fields');
console.log('Seller public profile privacy checks: PASS');
