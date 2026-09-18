import fs from 'node:fs';
import assert from 'node:assert/strict';

const publish = fs.readFileSync('src/components/NationalPublishScreen.tsx','utf8');
const permissions = fs.readFileSync('src/components/PermissionSettings.tsx','utf8');

assert.match(publish, /verifiedEmailBetaAuth\.refreshVerificationStatus\(\)/, 'publish must refresh verified-email status before write');
assert.match(publish, /publish_email_not_verified/, 'publish must distinguish unverified identity from generic permission failure');
assert.match(publish, /PUBLISH_DRAFT_PREFIX/, 'publish draft persistence must exist');
assert.match(publish, /sessionStorage\.setItem/, 'publish draft must persist during tab changes');
assert.match(publish, /clearPublishDraft\(user\.id\)/, 'successful publish must clear the recovered draft');

for (const staleGuard of [
  "!title.trim() && suggestion.title",
  "!price.trim() && suggestion.price",
  "!description.trim() && suggestion.description",
  "!category && suggestion.category",
]) {
  assert.equal(publish.includes(staleGuard), false, `Topi compose must not silently refuse to transfer suggestion because field already had content: ${staleGuard}`);
}
assert.match(publish, /if \(suggestion\.title\) setTitle\(suggestion\.title\)/);
assert.match(publish, /if \(suggestion\.description\) setDescription\(suggestion\.description\)/);
assert.match(publish, /if \(suggestion\.category\)/);

assert.match(permissions, /window\.addEventListener\('focus', update\)/, 'permission center must refresh after returning from Android settings');
assert.match(permissions, /visibilitychange/, 'permission center must refresh when app becomes visible');
assert.match(permissions, /queryCapabilityPermission\(id\)\.catch\(\(\) => requested\)/, 'permission request must be followed by authoritative re-query');

console.log('✅ build116 Device A feedback contract PASS');
