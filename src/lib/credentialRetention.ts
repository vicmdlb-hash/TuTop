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
  if (!input.hasImageData) return { kind: 'none', reason: 'no_image_data' };
  if (input.status === 'pending') return { kind: 'none', reason: 'pending_review' };
  if (!input.retentionDeleteAfter) return { kind: 'none', reason: 'retention_deadline_missing' };

  const deleteAfterMs = Date.parse(input.retentionDeleteAfter);
  if (!Number.isFinite(deleteAfterMs)) return { kind: 'none', reason: 'retention_deadline_invalid' };
  if (deleteAfterMs > nowMs) return { kind: 'none', reason: 'retention_window_active' };

  return { kind: 'delete_image_data', reason: 'retention_deadline_reached' };
}
