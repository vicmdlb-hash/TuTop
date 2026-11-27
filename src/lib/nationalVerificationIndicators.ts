/**
 * Read-only national account verification indicators.
 *
 * SECURITY: The caller must supply the result of Firebase Auth accounts:lookup
 * for the active ID token. This helper never verifies a self-declared phone and
 * must NOT be used as an authorization gate. Server-side Firebase Auth token
 * claims and Firestore Rules must enforce marketplace permissions.
 *
 * Real telephone verification remains disabled while TuTop is on Spark and its
 * owner has authorized MXN $0. Test phone numbers are NEVER a production proof.
 */
export type FirebaseAuthLookupEvidence = {
  localId?: unknown;
  emailVerified?: unknown;
  phoneNumber?: unknown;
} | null | undefined;

export type NationalVerificationIndicators = {
  emailVerified: boolean;
  phoneVerified: boolean;
};

export function nationalVerificationIndicators(
  evidence: FirebaseAuthLookupEvidence,
  activeUid: string,
): NationalVerificationIndicators {
  if (!activeUid || !evidence || evidence.localId !== activeUid) {
    return { emailVerified: false, phoneVerified: false };
  }
  // Mexican phone must be in E.164 format as stored by Firebase Auth. The
  // presence of a number in user_private/telefono or in local session state is
  // intentionally irrelevant here.
  const phoneVerified = typeof evidence.phoneNumber === 'string'
    && /^\+52[1-9][0-9]{9}$/.test(evidence.phoneNumber);
  return {
    emailVerified: evidence.emailVerified === true,
    phoneVerified,
  };
}
