// Device A build106 hotfix layer. Keep this module intentionally narrow: it
// repairs only physical failures that were reproduced after build105. It must
// never turn a rejected write into a fake PASS or bypass Firestore Security Rules.
import './nationalIdentityHydrationBridge';
import { canonicalListingsBackend } from './canonicalListingsBackend';
import { recordDiagnostic } from './localDiagnostics';
import { onlineBackend } from './onlineBackend';
import { completePendingUniversityIdentity } from './v2OnboardingRecovery';

const state = canonicalListingsBackend as typeof canonicalListingsBackend & { __deviceA106Installed?: boolean };

function publicationFailureKind(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error || '');
  if (/Missing or insufficient permissions|PERMISSION_DENIED|403/i.test(raw)) return 'permission';
  if (/universidad|campus|IDENTITY|PROFILE_|CATALOG_|INSTITUTION_|CAMPUS_/i.test(raw)) return 'identity';
  if (/TOKEN_EXPIRED|INVALID_ID_TOKEN|AUTH_SESSION_CHANGED|UNAUTHENTICATED|401/i.test(raw)) return 'session';
  return 'other';
}

async function repairPhysicalPublicationContext() {
  // Pending onboarding data may exist after a killed/recreated Android activity.
  // Finishing it is idempotent and remains subject to the normal catalog/rules.
  await completePendingUniversityIdentity().catch(() => false);

  // Force a fresh token before one bounded retry. This repairs stale-restored
  // sessions but does not grant privileges or weaken any server-side rule.
  const client = onlineBackend.configureFromRuntime();
  if (!client?.currentSession) throw new Error('AUTH_REQUIRED');
  await client.getIdToken();
}

if (!state.__deviceA106Installed) {
  Object.defineProperty(state, '__deviceA106Installed', { value: true, enumerable: false, configurable: false });
  const create = canonicalListingsBackend.create.bind(canonicalListingsBackend);

  canonicalListingsBackend.create = async (listing, category) => {
    try {
      return await create(listing, category);
    } catch (error) {
      const kind = publicationFailureKind(error);
      if (kind === 'other') throw error;
      recordDiagnostic('publication', 'build106_first_attempt_failed', { failure_kind: kind });

      try {
        await repairPhysicalPublicationContext();
      } catch (repairError) {
        recordDiagnostic('publication', 'build106_context_repair_failed', { failure_kind: publicationFailureKind(repairError) });
        throw error;
      }

      try {
        const result = await create(listing, category);
        recordDiagnostic('publication', 'build106_retry_success', { recovered_from: kind });
        return result;
      } catch (retryError) {
        recordDiagnostic('publication', 'build106_retry_failed', { failure_kind: publicationFailureKind(retryError) });
        throw retryError;
      }
    }
  };
}

export const DEVICE_A_BUILD106_HARDENING = {
  bounded_publication_retry: true,
  refreshes_auth_before_retry: true,
  completes_pending_identity_before_retry: true,
  bypasses_security_rules: false,
  retries: 1,
} as const;
