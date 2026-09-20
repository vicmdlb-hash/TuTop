export type PublicationVerificationStatus = {
  emailVerified: boolean;
};

export type PublicationRecoveryDiagnostic = (
  code: 'publish_self_heal_started' | 'publish_self_heal_success' | 'publish_self_heal_refresh_failed' | 'publish_self_heal_retry_failed',
) => void;

export function publicationErrorText(error: unknown) {
  return error instanceof Error ? error.message : String(error || '');
}

export function isRecoverablePublicationSessionError(error: unknown) {
  const raw = publicationErrorText(error);
  return /Missing or insufficient permissions|PERMISSION_DENIED|HTTP 403|UNAUTHENTICATED|INVALID_ID_TOKEN|TOKEN_EXPIRED|HTTP 401/i.test(raw);
}

export async function withPublicationSessionRecovery<T>(input: {
  attempt: () => Promise<T>;
  refreshVerification: () => Promise<PublicationVerificationStatus>;
  diagnostic?: PublicationRecoveryDiagnostic;
}) {
  try {
    return await input.attempt();
  } catch (firstError) {
    if (!isRecoverablePublicationSessionError(firstError)) throw firstError;

    input.diagnostic?.('publish_self_heal_started');

    let verification: PublicationVerificationStatus;
    try {
      verification = await input.refreshVerification();
    } catch {
      input.diagnostic?.('publish_self_heal_refresh_failed');
      throw new Error('PUBLISH_SESSION_REFRESH_FAILED');
    }

    if (!verification.emailVerified) {
      input.diagnostic?.('publish_self_heal_refresh_failed');
      throw new Error('PUBLISH_EMAIL_NOT_VERIFIED_AFTER_REFRESH');
    }

    try {
      const result = await input.attempt();
      input.diagnostic?.('publish_self_heal_success');
      return result;
    } catch (retryError) {
      input.diagnostic?.('publish_self_heal_retry_failed');
      throw retryError;
    }
  }
}
