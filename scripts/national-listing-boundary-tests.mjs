import assert from 'node:assert/strict';
import fs from 'node:fs';
import { listingV2HasNoLegacyDescriptionPacking } from '../src/lib/listingSchemaV2.ts';

const national = {
  schema_version: 2, seller_id: 'uid-synthetic',
  category_id: 'electronics', title: 'Producto de ejemplo',
  description: 'Ejemplo sintético', attributes: {},
  price_mxn: 200, negotiable: false, quantity: 1,
  delivery_methods: ['shipping'], meeting_point_ids: [],
  shipping_available: true, photo_urls: ['data:image/png;base64,YQ=='],
  status: 'draft', moderation_status: 'pending',
  visibility_scope: 'national',
  created_at: '2026-10-26T00:00:00Z', updated_at: '2026-10-26T00:00:00Z',
};
const candidate = (patch) => ({ ...national, ...patch });
assert.equal(listingV2HasNoLegacyDescriptionPacking(national), true,
  'national scope may have no invented university/campus when only modeling schema');
assert.equal(listingV2HasNoLegacyDescriptionPacking(candidate({
  delivery_methods: ['pickup'], shipping_available: false,
})), true, 'national visibility may use explicit in-person pickup without shipping');
assert.equal(listingV2HasNoLegacyDescriptionPacking(candidate({
  visibility_scope: 'city', city_id: 'TLAX-huamantla',
  delivery_methods: ['pickup'], shipping_available: false,
})), true);
for (const bad of [
  { institution_id: 'uatx' },
  { campus_id: 'uatx-riberena' },
  { institution_id: 'national', campus_id: '' },
  { visibility_scope: 'city' },
  { visibility_scope: 'campus' },
  { visibility_scope: 'institution' },
  { visibility_scope: 'university-zone' },
  { shipping_available: false },
  { delivery_methods: ['pickup'], shipping_available: true },
  { delivery_methods: ['campus_meetup'] },
  { meeting_point_ids: ['fake-campus-meeting-point'] },
]) {
  assert.equal(listingV2HasNoLegacyDescriptionPacking(candidate(bad)), false,
    'non-campus national data cannot masquerade as an affiliated or local scoped listing');
}
assert.equal(listingV2HasNoLegacyDescriptionPacking(candidate({
  institution_id: 'uatx', campus_id: 'uatx-riberena',
  visibility_scope: 'campus', delivery_methods: ['campus_meetup'], shipping_available: false,
})), true, 'existing campus listing schema must remain compatible');

// Structural preparation is NOT permission to send the national candidate.
// Check the authenticated backend fails before even selecting a Firebase client.
const backend = fs.readFileSync('src/services/canonicalListingsBackend.ts', 'utf8');
const create = backend.slice(backend.indexOf('  async create(listing: CanonicalListingV2'),
  backend.indexOf('  async loadMine(', backend.indexOf('  async create(listing: CanonicalListingV2')));
assert(create.includes("throw new Error('NATIONAL_RULES_AND_PHONE_PROOF_NOT_READY')"));
assert(create.indexOf('NATIONAL_RULES_AND_PHONE_PROOF_NOT_READY') < create.indexOf('const client = getClient()'));
const generator = fs.readFileSync('scripts/prepare-firestore-v2-rules.mjs', 'utf8');
assert(generator.includes('request.resource.data.institution_id is string'));
assert(generator.includes('request.resource.data.campus_id is string'));
const nationalShippingContract = "request.resource.data.shipping_available == true";
assert.equal(generator.split(nationalShippingContract).length - 1, 2,
  'both create and seller update Rules must prohibit nationwide delivery misrepresentation');
assert.equal(generator.split("'shipping' in request.resource.data.delivery_methods").length - 1, 2,
  'both Rules paths must require a real matching shipping option');
const screen = fs.readFileSync('src/components/NationalPublishScreen.tsx', 'utf8');
assert.match(screen, /scope === 'national' && !shippingAvailable/);
assert.match(screen, /Para publicar en Todo México necesitas ofrecer la opción de paquetería o envío/);

const policy = JSON.parse(fs.readFileSync('config/tutop-national-product-direction.json', 'utf8'));
assert.equal(policy.verification.publicRegistrationWithDualFactor, 'BLOCKED_UNTIL_REAL_PHONE_PROOF');
assert.equal(policy.release.releaseApproved, false);
console.log('PASS campus-free nationwide listing is schema-only; no fake school metadata');
console.log('PASS all campus scopes, delivery and mixed identities fail without catalog proof');
console.log('PASS backend denies campus-free writes before Firebase; current Rules still deny');
