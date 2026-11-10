import assert from 'node:assert/strict';
import fs from 'node:fs';
const publish = fs.readFileSync('src/components/NationalPublishScreen.tsx', 'utf8');
const auth = fs.readFileSync('src/services/verifiedEmailBetaAuth.ts', 'utf8');
const backendGate = fs.readFileSync('src/components/BackendGate.tsx', 'utf8');
assert.match(auth, /return \{ uid: user\.localId, email: normalizedUserEmail, emailVerified: verified, phoneVerified: evidence\.phoneVerified \}/);
assert.match(backendGate, /!verified\.emailVerified \|\| verified\.phoneVerified !== true/);
const body = publish.slice(publish.indexOf('  const publish = async () => {'));
const locate = (needle) => {
  const index = body.indexOf(needle);
  assert(index >= 0, 'missing publish identity gate: ' + needle);
  return index;
};
const verified = locate('await verifiedEmailBetaAuth.refreshVerificationStatus()');
const sameUid = locate('if (verification.uid !== user.id)');
const email = locate('if (!verification.emailVerified)');
const phone = locate('if (verification.phoneVerified !== true)');
const media = locate('await firebaseMediaStorage.uploadListingVideo(videoFile, user.id)');
const write = locate('await withPublicationSessionRecovery(');
assert(verified < sameUid && sameUid < email && email < phone && phone < media && media < write,
  'fresh same-UID, email and phone gates must precede media upload and listing write');
assert.match(body, /catch \{\s*recordDiagnostic\('publication', 'publish_identity_refresh_failed'\)/);
const refreshBlock = body.slice(verified, sameUid);
assert.doesNotMatch(refreshBlock, /const reason = error|\$\{reason\}|String\(error\)/,
  'raw provider errors may expose internal URLs or identifiers in UI');
console.log('PASS publish requires fresh same UID+email+phone Auth status before media upload/listing write, with redacted errors');
