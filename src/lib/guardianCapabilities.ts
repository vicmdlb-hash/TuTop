/**
 * All-ages capability decisions. This is a PURE policy contract, not a backend
 * trust boundary: callers MUST establish the proof through a trusted server.
 * Never read client-editable profiles, local storage or UI age controls as proof.
 *
 * The current Firestore V2 Rules DO NOT enforce these capabilities. Until they
 * do, this module must not be advertised as making TuTop safe for minors.
 */
export type AgeBand = 'unknown' | 'under_13' | 'teen_13_17' | 'adult';
export type Capability =
  | 'browse_approved'
  | 'publish_listing'
  | 'direct_chat'
  | 'make_offer'
  | 'share_personal_info'
  | 'precise_location'
  | 'topi_generative';

export type TrustedAgeProof = {
  subjectUid: string;
  band: AgeBand;
  issuer: 'trusted_server';
  expiresAtMs: number;
  revoked: boolean;
};
export type GuardianProof = {
  childUid: string;
  guardianUid: string;
  issuer: 'trusted_server';
  active: boolean;
  expiresAtMs: number;
  consentVersion: string;
  approvedCapabilities: Capability[];
};
export type TopiRuntimeApproval = {
  audience: 'all_ages' | 'adults_only';
  approved: boolean;
  // Evaluated legal, child-safety, distribution and operational requirements.
  // A license identifier or an App Check token alone is NOT approval.
  issuer: 'trusted_server';
};
export type CapabilityDecision = {
  allowed: boolean;
  reason:
    | 'age_unverified'
    | 'guardian_missing'
    | 'requires_guardian_action'
    | 'age_restricted'
    | 'topi_runtime_unapproved'
    | 'approved';
};

const DENIED = (reason: CapabilityDecision['reason']): CapabilityDecision =>
  ({ allowed: false, reason });
const ALLOWED: CapabilityDecision = { allowed: true, reason: 'approved' };

function trustedAge(uid: string, proof: TrustedAgeProof | null, nowMs: number): AgeBand {
  return proof && uid && proof.subjectUid === uid && proof.issuer === 'trusted_server'
    && !proof.revoked && Number.isFinite(proof.expiresAtMs) && proof.expiresAtMs > nowMs
    ? proof.band : 'unknown';
}
function trustedGuardian(uid: string, proof: GuardianProof | null, cap: Capability, nowMs: number) {
  return Boolean(proof && proof.issuer === 'trusted_server' && proof.childUid === uid
    && proof.guardianUid && proof.guardianUid !== uid && proof.active
    && Number.isFinite(proof.expiresAtMs) && proof.expiresAtMs > nowMs
    && proof.consentVersion.trim() && proof.approvedCapabilities.includes(cap));
}

/**
 * Fail closed for unknown/expired/revoked proofs, all AI with no approved
 * runtime, and personal-information exchange without an adult action.
 * Do not rely on this client-callable helper to enforce Firestore access.
 */
export function decideCapability(input: {
  uid: string;
  capability: Capability;
  age: TrustedAgeProof | null;
  guardian?: GuardianProof | null;
  topi?: TopiRuntimeApproval | null;
  adultActionForPersonalInfo?: boolean;
  nowMs: number;
}): CapabilityDecision {
  const { uid, capability, nowMs } = input;
  if (!uid || !Number.isFinite(nowMs)) return DENIED('age_unverified');
  const band = trustedAge(uid, input.age, nowMs);
  if (band === 'unknown') return DENIED('age_unverified');

  if (capability === 'topi_generative') {
    if (!input.topi || input.topi.issuer !== 'trusted_server' || !input.topi.approved
      || input.topi.audience !== 'all_ages') return DENIED('topi_runtime_unapproved');
  }

  if (band === 'adult') return ALLOWED;
  if (band === 'teen_13_17') {
    if (capability === 'share_personal_info' && !input.adultActionForPersonalInfo)
      return DENIED('requires_guardian_action');
    if (capability === 'precise_location') return DENIED('age_restricted');
    return ALLOWED;
  }

  // Under 13: independent direct chat, offers, precise location and personal
  // information exchange remain closed; ordinary guardian consent alone must
  // not be misread as approval of every sensitive exchange.
  if (!['browse_approved', 'publish_listing', 'topi_generative'].includes(capability))
    return DENIED('age_restricted');
  if (!trustedGuardian(uid, input.guardian || null, capability, nowMs))
    return DENIED('guardian_missing');
  return ALLOWED;
}
