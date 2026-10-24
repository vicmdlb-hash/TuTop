/**
 * Release guard for the current TuTop audience, which intentionally includes
 * under-13 children, teens and adults. The Firebase AI Logic native bridge
 * does not expose an attestable upstream API-provider/license identity.
 *
 * Gemini Developer API additional terms (effective 2026-03-23) disallow API
 * clients likely accessed by under-18 users. Firebase AI Logic can route to
 * different Gemini API providers; App Check proves client attestation, NOT
 * contract, consent, privacy or child-safety eligibility.
 *
 * NO client-side flag, age string or token can certify remote eligibility.
 * A separate legal/provider review, trusted backend enforcement and an
 * audited native transport are required before remote AI can be re-enabled.
 *
 * IMPORTANT: this denies ONLY the current remote native bridge. It does not
 * represent a generative on-device model or substitute for Topi release QA.
 */
export type TopiAudienceGate = Readonly<{
  allowed: false;
  reason: 'audience-provider-not-approved';
  upstreamVerified: false;
  allAgesReleaseApproved: false;
}>;

export function topiRemoteProviderAudienceGate(): TopiAudienceGate {
  return Object.freeze({
    allowed: false,
    reason: 'audience-provider-not-approved',
    upstreamVerified: false,
    allAgesReleaseApproved: false,
  });
}
