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
// Code wiring contract: await boundaries must check the LIVE store UID,
// Firebase UID and login generation, not only a stale component closure.
assert.match(publish, /import \{ isCurrentBackendHydration \} from '\.\.\/lib\/backendHydrationIdentity';/);
assert.match(body, /const publishAuthEpoch = verifiedEmailBetaAuth\.sessionGeneration\(\)/);
assert.match(body, /const publisherStillCurrent = \(\) => isCurrentBackendHydration\([\s\S]*?useAppStore\.getState\(\)\.user\.id,[\s\S]*?readSessionIdentity\(\)\?\.uid,[\s\S]*?publishAuthEpoch,[\s\S]*?verifiedEmailBetaAuth\.sessionGeneration\(\)/);
const ownerAfterAuth = locate('if (!publisherStillCurrent()) {');
const ownerAfterUpload = locate("if (!publisherStillCurrent()) throw new Error('PUBLISH_OWNER_CHANGED')");
const guardedAttempt = locate("if (!publisherStillCurrent()) throw new Error('PUBLISH_OWNER_CHANGED');\n          return canonicalListingsBackend.create(");
const guardedRetry = locate('const refreshed = await verifiedEmailBetaAuth.refreshVerificationStatus();');
const ownerAfterCommit = locate('if (!publisherStillCurrent()) return;\n      clearPublishDraft(user.id);');
const feedFetch = locate('const refreshed = await canonicalListingsBackend.loadMarketplaceProducts(');
const feedOwner = locate('if (!publisherStillCurrent()) return;\n        useAppStore.setState({ products: refreshed });');
const feedMessage = locate('if (!publisherStillCurrent()) return;\n      setMessage(created.recovered');
const delayedTab = locate("if (publisherStillCurrent()) setActiveTab('feed');");
assert(ownerAfterAuth < sameUid && ownerAfterUpload > media && ownerAfterUpload < guardedAttempt,
  'identity and video awaits must fail closed before the listing write');
assert(guardedAttempt < guardedRetry && guardedRetry < ownerAfterCommit,
  'retry must re-check owner and Firebase claims before a second attempt');
assert.match(body.slice(guardedRetry, ownerAfterCommit),
  /!publisherStillCurrent\(\) \|\| refreshed\.uid !== user\.id[\s\S]*?!refreshed\.emailVerified \|\| refreshed\.phoneVerified !== true/);
assert(ownerAfterCommit < feedFetch && feedFetch < feedOwner && feedOwner < feedMessage && feedMessage < delayedTab,
  'late feed results, UI success and navigation must not hydrate another account');
assert.match(body, /if \(uploadedVideoUri && publisherStillCurrent\(\)\)/,
  'cleanup must not try an A-owned upload using the new B account');
assert.match(body, /finally \{\s*if \(publisherStillCurrent\(\)\) setBusy\(false\)/);
console.log('PASS publication A→B/A→B→A session-epoch guards cover verification, media, retry, feed and delayed navigation');
console.log('PASS publish requires fresh same UID+email+phone Auth status before media upload/listing write, with redacted errors');
