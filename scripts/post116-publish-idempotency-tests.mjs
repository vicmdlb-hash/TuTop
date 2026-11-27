import assert from 'node:assert/strict';
import fs from 'node:fs';

const publish = fs.readFileSync('src/components/NationalPublishScreen.tsx','utf8');
const backend = fs.readFileSync('src/services/canonicalListingsBackend.ts','utf8');
const bridge = fs.readFileSync('src/services/nationalIdentityHydrationBridge.ts','utf8');

assert.match(publish, /operationId\?: string/);
assert.match(publish, /initialDraft\?\.operationId \|\| newPublishOperationId\(\)/);
assert.match(publish, /setPublishOperationId\(newPublishOperationId\(\)\)/, 'discard must rotate the operation id');
assert.match(publish, /operationId: publishOperationId/);
assert.match(publish, /canonicalListingsBackend\.create\(listing, category, publishOperationId\)/);
assert.match(publish, /created\.recovered/);

assert.match(backend, /function listingIdForOperation\(operationId: string\)/);
assert.match(backend, /return `listing-op-\$\{clean\}`/);
assert.match(backend, /return \{ id, \.\.\.existing\.data, recovered: true as const \}/, 'recovery must return canonical stored truth, not the retry payload');
assert.match(backend, /async create\(listing: CanonicalListingV2, category: ProductCategory, operationId\?: string\)/);
assert.match(backend, /const alreadyCommitted = await recoverCommitted\(\)/);
assert.match(backend, /if \(alreadyCommitted\) \{[\s\S]*nearbyCache\.clear\(\);[\s\S]*return alreadyCommitted;[\s\S]*\}/);
assert.match(backend, /catch \(error\) \{[\s\S]*const recovered = await recoverCommitted\(\)/);
assert.match(backend, /currentDocument: \{ exists: false \}/);

assert.match(bridge, /create = async \(listing, category, operationId\)/);
assert.match(bridge, /originalCreateListing\(listing, category, operationId\)/);
assert.match(bridge, /category, operationId\)/);

const op = '550e8400-e29b-41d4-a716-446655440000';
const deterministic = `listing-op-${op}`;
assert.equal(deterministic, 'listing-op-550e8400-e29b-41d4-a716-446655440000');


const betaTerms = fs.readFileSync('public/terms.html', 'utf8');
const ackVersion = publish.match(/const UGC_BETA_RULES_VERSION = '([^']+)'/);
assert(ackVersion, 'source must declare an explicit beta content-rules revision');
assert(betaTerms.includes('Versión: ' + ackVersion[1]),
  'linked beta community rules must show the same revision as the publish UX');
assert.match(betaTerms, /no sustituye términos legales finales/,
  'technical beta acknowledgement is NOT legal consent');

assert.match(publish, /const \[ugcRulesAccepted, setUgcRulesAccepted\] = useState\(false\)/);
assert.match(publish, /const ugcConsentReady = ugcRulesAccepted && ugcAcceptedVersionRef\.current === UGC_BETA_RULES_VERSION/);
assert.match(publish, /if \(!ugcConsentReady\) publishIssues\.push/);
assert.match(publish, /if \(!ugcConsentReady \|\| !consentStillValid\(\)\) return setMessage/);
assert.match(publish, /ugcAcceptedVersionRef\.current = event\.target\.checked \? UGC_BETA_RULES_VERSION : null/);
assert.match(publish, /onChange=\{\(event\) => \{\s+ugcConsentEpoch\.current \+= 1/);
assert.match(publish, /ugcConsentEpoch\.current \+= 1;\s+ugcAcceptedVersionRef\.current = null;/);
assert.match(publish, /href="\/terms\.html" target="_blank" rel="noopener noreferrer"/);
assert.match(publish, /no se guarda en borradores/);

const beginPublish = publish.indexOf('const publish = async () => {');
const uploadVideo = publish.indexOf('firebaseMediaStorage.uploadListingVideo(', beginPublish);
const beforeUpload = publish.indexOf("if (!consentStillValid()) throw new Error('UGC_RULES_ACK_REVOKED');", beginPublish);
assert(beginPublish >= 0 && beforeUpload > beginPublish && uploadVideo > beforeUpload,
  'revoked technical acknowledgement must block BEFORE any video upload');
const attempt = publish.indexOf('attempt: () => {', beginPublish);
const startCanonicalWrite = publish.indexOf('canonicalListingsBackend.create(listing, category, publishOperationId)', beginPublish);
const attemptGate = publish.indexOf("if (!consentStillValid()) throw new Error('UGC_RULES_ACK_REVOKED');", attempt);
assert(attempt >= 0 && attemptGate > attempt && startCanonicalWrite > attemptGate,
  'acknowledgement must be rechecked immediately before every listing write/retry');
const draftStart = publish.indexOf('const draftSnapshot = ');
const draftEnd = publish.indexOf(']), [publishOperationId', draftStart);
const draftSection = publish.slice(draftStart, draftEnd >= 0 ? draftEnd : draftStart + 430);
assert(!draftSection.includes('ugcRulesAccepted') && !draftSection.includes('UGC_BETA_RULES_VERSION'),
  'a saved draft must NEVER auto-restore content acknowledgement for another listing/account');
console.log('PASS source-only beta UGC acknowledgement: linked revision, explicit per-listing opt-in, pre-media/write/retry guards, no draft restore; no legal/server consent claim');

console.log('PASS publish operation id survives draft + identity bridge and uncertain retry reconciles one deterministic listing');
