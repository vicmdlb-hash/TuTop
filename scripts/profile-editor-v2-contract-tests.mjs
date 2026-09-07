import fs from 'node:fs';
import assert from 'node:assert/strict';

const profile = fs.readFileSync('src/components/Profile.tsx', 'utf8');
const listingFields = fs.readFileSync('src/lib/nationalListingFields.ts', 'utf8');

assert.match(listingFields, /nationalFieldsFor\(/);

const categoryEditable = /<select[^>]*value=\{editingProduct\.categoria\}/.test(profile);
const editorHasNationalFields = /nationalFieldsFor\(/.test(profile) || /attributes/.test(profile);

if (categoryEditable && !editorHasNationalFields) {
  console.error('FAIL PROFILE_EDITOR_V2_CATEGORY_DRIFT: Profile lets sellers change category without rendering/validating the new category attributes.');
  console.error('Required before release: either make category read-only in this legacy editor or render nationalFieldsFor(newCategory) and validate required attributes before save.');
  process.exit(1);
}

console.log('PASS profile editor cannot change category without V2 attribute validation');
console.log('Profile editor V2 contract: PASS');
