/**
 * TRUSTED UGC ISSUER CONTRACT — DRY RUN ONLY.
 *
 * The caller MUST be an independently authenticated and audited privileged
 * backend that has verified the age evidence, real guardian relationship,
 * legal consent, policy approval and the exact current subject. None of those
 * things can be established from these parameters or from a client claim.
 *
 * This planner performs NO I/O, authentication, signature verification,
 * Firestore mutations, token issuance, deployment or account admission.
 * Returned records are schematic; never submit them as Admin SDK writes.
 * The version currently shipped in TuTop is a DRAFT and MUST be refused.
 */
import { trustedUgcConsentReady } from '../src/lib/guardianCapabilities.ts';

const uidValid = value => typeof value === 'string'
  && /^[A-Za-z0-9_-]{1,128}$/.test(value) && !value.startsWith('__');
const deny = reason => Object.freeze({
  kind: 'PREVIEW_NOT_EXECUTABLE', eligibleForPrivilegedReview: false,
  reason, completionVerified: false,
});

export function prepareTrustedUgcIssuerPreview(input) {
  if (!input || typeof input !== 'object') return deny('INVALID_INPUT');
  const { subjectUid, nowMs, approvedPolicy, ageProof, guardianProof, consentProof } = input;
  if (!uidValid(subjectUid) || !Number.isSafeInteger(nowMs) || nowMs <= 0) {
    return deny('INVALID_SUBJECT_OR_CLOCK');
  }
  // This is a structural reminder, NOT legal approval authentication.
  if (!approvedPolicy || approvedPolicy.status !== 'approved'
    || typeof approvedPolicy.version !== 'string' || !approvedPolicy.version.trim()
    || /draft|borrador|beta-draft/i.test(approvedPolicy.version)) {
    return deny('POLICY_NOT_APPROVED');
  }
  if (!ageProof || !['under_13', 'teen_13_17', 'adult'].includes(ageProof.band)
    || !Number.isSafeInteger(ageProof.expiresAtMs)) {
    return deny('AGE_PROOF_UNVERIFIED');
  }
  if (!consentProof || !Number.isSafeInteger(consentProof.expiresAtMs)) {
    return deny('UGC_PROOF_UNVERIFIED');
  }
  if (!trustedUgcConsentReady({
    uid: subjectUid, rulesVersion: approvedPolicy.version, nowMs,
    age: ageProof, guardian: guardianProof || null, consent: consentProof,
  })) return deny('AGE_GUARDIAN_OR_UGC_CONSENT_UNVERIFIED');

  const minor = ageProof.band !== 'adult';
  const deadline = Math.min(ageProof.expiresAtMs, consentProof.expiresAtMs,
    minor ? guardianProof.expiresAtMs : Number.MAX_SAFE_INTEGER);
  if (!Number.isSafeInteger(deadline) || deadline <= nowMs) return deny('EXPIRY_INVALID');
  // A safe integer can still exceed the JavaScript Date range. Refuse it
  // rather than throw during this read-only review and bypass its denial result.
  const expiryDate = new Date(deadline);
  if (!Number.isFinite(expiryDate.getTime())) return deny('EXPIRY_INVALID');
  const expires_at = expiryDate.toISOString();
  const ageRecord = {
    subjectUid, band: ageProof.band, issuer: 'trusted_server',
    revoked: false, expires_at,
    ...(minor ? { guardian: {
      childUid: subjectUid, guardianUid: guardianProof.guardianUid,
      issuer: 'trusted_server', active: true, expires_at,
      consentVersion: guardianProof.consentVersion,
      approvedCapabilities: [...guardianProof.approvedCapabilities],
    } } : {}),
  };
  const ugcRecord = {
    subjectUid, issuer: 'trusted_server',
    rulesVersion: approvedPolicy.version, granted: true,
    revoked: false, expires_at,
    ...(minor ? { guardianConsentVersion: guardianProof.consentVersion } : {}),
  };
  // One atomic publication snapshot minimizes Firestore rule expressions.
  // A separate consent receipt is a server-only audit copy; NEVER a fallback
  // authorization when the embedded proof has expired or been revoked.
  ageRecord.ugc = ugcRecord;
  return {
    kind: 'PREVIEW_NOT_EXECUTABLE',
    eligibleForPrivilegedReview: true,
    completionVerified: false,
    requiresAuthenticatedServerCaller: true,
    requiresExternalVerifiedGuardianRelationship: minor,
    requiresActualLegalPolicyApproval: true,
    requiresAtomicIssueRevokeAndAdmissionFreeze: true,
    requiresSeparateMarketplaceTransactionChecks: true,
    records: [
      { path: 'age_proofs_v2/' + subjectUid, mode: 'SERVER_ONLY_ATOMIC_PREVIEW', data: ageRecord },
      { path: 'ugc_consents_v2/' + subjectUid, mode: 'SERVER_ONLY_AUDIT_PREVIEW', data: ugcRecord },
    ],
  };
}
