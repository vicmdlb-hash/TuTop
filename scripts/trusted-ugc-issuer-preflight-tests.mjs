import assert from 'node:assert/strict';
import { prepareTrustedUgcIssuerPreview } from './trusted-ugc-issuer-preflight.mjs';

// SYNTHETIC ONLY. No real user, no legal approval, no Firebase connections.
const nowMs = 1_800_000_000_000;
const validVersion = 'ugc-approved-synthetic-v2'; // not an actual approved policy
const age = (band, extras = {}) => ({
  subjectUid: 'synthetic-child', issuer: 'trusted_server',
  band, revoked: false, expiresAtMs: nowMs + 300_000, ...extras,
});
const guardian = (extras = {}) => ({
  childUid: 'synthetic-child', guardianUid: 'synthetic-guardian',
  issuer: 'trusted_server', active: true, expiresAtMs: nowMs + 120_000,
  consentVersion: 'guardian-synthetic-v3',
  approvedCapabilities: ['publish_listing'], ...extras,
});
const ugc = (extras = {}) => ({
  subjectUid: 'synthetic-child', issuer: 'trusted_server',
  rulesVersion: validVersion, granted: true, revoked: false,
  expiresAtMs: nowMs + 240_000,
  guardianConsentVersion: 'guardian-synthetic-v3', ...extras,
});
const input = (extras = {}) => ({
  subjectUid: 'synthetic-child', nowMs,
  approvedPolicy: { status: 'approved', version: validVersion },
  ageProof: age('adult'), guardianProof: null, consentProof: ugc(),
  ...extras,
});
const deny = (reason, candidate) => {
  const result = prepareTrustedUgcIssuerPreview(candidate);
  assert.equal(result.kind, 'PREVIEW_NOT_EXECUTABLE');
  assert.equal(result.eligibleForPrivilegedReview, false);
  assert.equal(result.completionVerified, false);
  assert.equal(result.reason, reason);
  assert.equal('records' in result, false);
};
const adult = prepareTrustedUgcIssuerPreview(input());
assert.equal(adult.eligibleForPrivilegedReview, true);
assert.equal(adult.completionVerified, false);
assert.equal(adult.records.length, 2);
assert.deepEqual(adult.records.map(r => r.path),
  ['age_proofs_v2/synthetic-child', 'ugc_consents_v2/synthetic-child']);
assert.equal(adult.records[0].data.ugc.rulesVersion, validVersion);
assert.equal(adult.records[0].data.guardian, undefined);
assert.equal(adult.records[0].data.expires_at, new Date(nowMs + 240_000).toISOString());
assert.equal(adult.requiresSeparateMarketplaceTransactionChecks, true);
assert.equal(adult.requiresActualLegalPolicyApproval, true);

const minor = prepareTrustedUgcIssuerPreview(input({
  ageProof: age('teen_13_17'), guardianProof: guardian(), consentProof: ugc(),
}));
assert.equal(minor.eligibleForPrivilegedReview, true);
assert.equal(minor.requiresExternalVerifiedGuardianRelationship, true);
assert.equal(minor.records[0].data.guardian.consentVersion, 'guardian-synthetic-v3');
assert.equal(minor.records[0].data.ugc.guardianConsentVersion, 'guardian-synthetic-v3');
assert.equal(minor.records[0].data.expires_at, new Date(nowMs + 120_000).toISOString());
assert.equal(prepareTrustedUgcIssuerPreview(input({
  ageProof: age('under_13'), guardianProof: guardian(), consentProof: ugc(),
})).eligibleForPrivilegedReview, true);

// The real TuTop version is a DRAFT: regardless of all other synthetic fields
// this preview MUST NOT generate schematics for its admission.
deny('POLICY_NOT_APPROVED', input({
  approvedPolicy: { status: 'approved', version: 'ugc-beta-draft-2026-11-14-v1' },
  consentProof: ugc({ rulesVersion: 'ugc-beta-draft-2026-11-14-v1' }),
}));
deny('POLICY_NOT_APPROVED', input({
  approvedPolicy: { status: 'pending', version: validVersion },
}));
deny('INVALID_SUBJECT_OR_CLOCK', input({ subjectUid: '../bad' }));
deny('INVALID_SUBJECT_OR_CLOCK', input({ nowMs: Number.NaN }));
deny('AGE_PROOF_UNVERIFIED', input({ ageProof: null }));
deny('AGE_PROOF_UNVERIFIED', input({ ageProof: age('unknown') }));
deny('UGC_PROOF_UNVERIFIED', input({ consentProof: null }));

for (const invalidAge of [
  age('adult', { issuer: 'client' }),
  age('adult', { revoked: true }),
  age('adult', { subjectUid: 'other' }),
  age('adult', { expiresAtMs: nowMs }),
]) deny('AGE_GUARDIAN_OR_UGC_CONSENT_UNVERIFIED', input({ ageProof: invalidAge }));
for (const invalidUgc of [
  ugc({ issuer: 'client' }), ugc({ revoked: true }), ugc({ granted: false }),
  ugc({ subjectUid: 'other' }), ugc({ rulesVersion: 'old-version' }),
  ugc({ expiresAtMs: nowMs }),
]) deny('AGE_GUARDIAN_OR_UGC_CONSENT_UNVERIFIED', input({ consentProof: invalidUgc }));
for (const badGuardian of [
  null, guardian({ issuer: 'client' }), guardian({ active: false }),
  guardian({ childUid: 'other' }), guardian({ guardianUid: 'synthetic-child' }),
  guardian({ consentVersion: 'old-version' }),
  guardian({ approvedCapabilities: ['direct_chat'] }),
  guardian({ expiresAtMs: nowMs }),
]) deny('AGE_GUARDIAN_OR_UGC_CONSENT_UNVERIFIED', input({
  ageProof: age('teen_13_17'), guardianProof: badGuardian, consentProof: ugc(),
}));
console.log('PASS trusted UGC privileged issuance preview: approved synthetic policy, owner/guardian/epoch, bounded expiry, fail-closed, no writes');
