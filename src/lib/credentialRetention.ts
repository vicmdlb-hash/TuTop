export type VerificationRetentionInput = {
  status: 'pending' | 'approved' | 'rejected';
  hasImageData: boolean;
  retentionDeleteAfter?: string;
};

export type CredentialRetentionPlan =
  | { kind: 'none'; reason: string }
  | { kind: 'delete_image_data'; reason: 'retention_deadline_reached' };

/**
 * Pure retention policy. It never deletes by itself.
 * Pending requests retain evidence for review; approved/rejected requests may purge
 * credential image data only after an explicit retention deadline has elapsed.
 */
export function credentialRetentionPlan(input: VerificationRetentionInput, nowMs = Date.now()): CredentialRetentionPlan {
  // Imported Firestore data can bypass TypeScript's compile-time status and
  // boolean types. Never authorize an image purge from malformed evidence.
  if (!input || typeof input !== 'object' || Array.isArray(input))
    return { kind: 'none', reason: 'retention_input_invalid' };
  if (input.hasImageData !== true) return { kind: 'none', reason: 'no_image_data' };
  if (input.status === 'pending') return { kind: 'none', reason: 'pending_review' };
  if (input.status !== 'approved' && input.status !== 'rejected')
    return { kind: 'none', reason: 'retention_status_invalid' };
  if (!Number.isSafeInteger(nowMs) || nowMs < 0)
    return { kind: 'none', reason: 'retention_clock_invalid' };
  if (!input.retentionDeleteAfter) return { kind: 'none', reason: 'retention_deadline_missing' };
  if (typeof input.retentionDeleteAfter !== 'string')
    return { kind: 'none', reason: 'retention_deadline_invalid' };

  const deleteAfterMs = Date.parse(input.retentionDeleteAfter);
  if (!Number.isFinite(deleteAfterMs)) return { kind: 'none', reason: 'retention_deadline_invalid' };
  if (deleteAfterMs > nowMs) return { kind: 'none', reason: 'retention_window_active' };

  return { kind: 'delete_image_data', reason: 'retention_deadline_reached' };
}
