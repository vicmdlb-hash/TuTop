import fs from 'node:fs';
import assert from 'node:assert/strict';

const profile = fs.readFileSync('src/components/Profile.tsx', 'utf8');
const listingFields = fs.readFileSync('src/lib/nationalListingFields.ts', 'utf8');

assert.match(listingFields, /nationalFieldsFor\(/);
assert.doesNotMatch(profile, /<select[^>]*value=\{editingProduct\.categoria\}/);
assert.doesNotMatch(profile, /categoria:\s*editingProduct\.categoria/);
assert.match(profile, /Para cambiar de categoría, crea una nueva publicación/);
assert.match(profile, /aria-label="Categoría actual"/);

console.log('PASS legacy profile editor keeps category read-only');
console.log('PASS category changes must go through a fresh V2 publication with correct required fields');
console.log('Profile editor V2 contract: PASS');
