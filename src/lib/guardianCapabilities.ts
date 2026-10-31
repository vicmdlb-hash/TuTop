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
export type VerifiedAdultAction = {
  subjectUid: string;
  actorUid: string;
  capability: 'share_personal_info';
  issuer: 'trusted_server';
  authorized: boolean;
  expiresAtMs: number;
};
export type CapabilityDecision = {
  allowed: boolean;
  reason:
    | 'age_unverified'
    | 'capability_unknown'
    | 'guardian_missing'
    | 'requires_guardian_action'
    | 'age_restricted'
    | 'topi_runtime_unapproved'
    | 'approved';
};

const DENIED = (reason: CapabilityDecision['reason']): CapabilityDecision =>
  ({ allowed: false, reason });
const ALLOWED: CapabilityDecision = { allowed: true, reason: 'approved' };
const KNOWN_CAPABILITIES: ReadonlySet<Capability> = new Set([
  'browse_approved', 'publish_listing', 'direct_chat', 'make_offer',
  'share_personal_info', 'precise_location', 'topi_generative',
]);
const VERIFIED_BANDS: ReadonlySet<AgeBand> = new Set([
  'under_13', 'teen_13_17', 'adult',
]);

function trustedAge(uid: string, proof: TrustedAgeProof | null, nowMs: number): AgeBand {
  return proof && typeof uid === 'string' && uid.trim().length > 0
    && proof.subjectUid === uid && proof.issuer === 'trusted_server'
    && proof.revoked === false && VERIFIED_BANDS.has(proof.band)
    && Number.isFinite(proof.expiresAtMs) && proof.expiresAtMs > nowMs
    ? proof.band : 'unknown';
}
function trustedGuardian(uid: string, proof: GuardianProof | null, cap: Capability, nowMs: number) {
  return Boolean(proof && proof.issuer === 'trusted_server' && proof.childUid === uid
    && typeof proof.guardianUid === 'string' && proof.guardianUid.trim().length > 0
    && proof.guardianUid !== uid && proof.active === true
    && Number.isFinite(proof.expiresAtMs) && proof.expiresAtMs > nowMs
    && typeof proof.consentVersion === 'string' && proof.consentVersion.trim().length > 0
    && Array.isArray(proof.approvedCapabilities) && proof.approvedCapabilities.includes(cap));
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
  adultAction?: VerifiedAdultAction | null;
  nowMs: number;
}): CapabilityDecision {
  if (!input || typeof input !== 'object') return DENIED('age_unverified');
  const { uid, capability, nowMs } = input;
  if (typeof uid !== 'string' || uid.trim().length === 0 || !Number.isFinite(nowMs))
    return DENIED('age_unverified');
  // TypeScript types do not validate Firestore/JSON data at runtime.
  if (!KNOWN_CAPABILITIES.has(capability)) return DENIED('capability_unknown');
  const band = trustedAge(uid, input.age, nowMs);
  if (band === 'unknown') return DENIED('age_unverified');

  if (capability === 'topi_generative') {
    if (!input.topi || input.topi.issuer !== 'trusted_server' || input.topi.approved !== true
      || input.topi.audience !== 'all_ages') return DENIED('topi_runtime_unapproved');
  }

  if (band === 'adult') return ALLOWED;
  if (band === 'teen_13_17') {
    if (capability === 'share_personal_info') {
      const action = input.adultAction;
      const guardian = input.guardian || null;
      // A valid adult action must be attributable to the child's CURRENT,
      // active, server-issued guardian grant. A random other adult, or an old
      // action after consent withdrawal, cannot authorize sharing PII.
      if (!trustedGuardian(uid, guardian, capability, nowMs)
        || !action || action.issuer !== 'trusted_server' || action.subjectUid !== uid
        || typeof action.actorUid !== 'string' || action.actorUid.trim().length === 0
        || action.actorUid !== guardian?.guardianUid
        || action.actorUid === uid
        || action.capability !== 'share_personal_info' || action.authorized !== true
        || !Number.isFinite(action.expiresAtMs) || action.expiresAtMs <= nowMs)
        return DENIED('requires_guardian_action');
    }
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
