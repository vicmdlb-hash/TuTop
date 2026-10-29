export type AccountDeletionCompletionEvidenceLike = {
  status?: unknown;
  requested_at?: unknown;
  completed_at?: unknown;
  erasure_policy_version?: unknown;
  residual_manifest_version?: unknown;
  processor_run_id?: unknown;
  deleted_count?: unknown;
  withdrawn_count?: unknown;
  retained_count?: unknown;
  auth_deleted?: unknown;
};

function nonNegativeInteger(value: unknown) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

export function hasTrustedAccountDeletionCompletion(
  request: AccountDeletionCompletionEvidenceLike | null | undefined,
) {
  if (!request || request.status !== 'completed' || request.auth_deleted !== true) return false;
  const completedAt = typeof request.completed_at === 'string' ? request.completed_at : '';
  const requestedAt = typeof request.requested_at === 'string' ? request.requested_at : '';
  // A completed status is only a client-visible evidence summary, not an
  // independent Auth deletion proof. Reject impossible chronology and incomplete
  // timestamps before displaying the request as finished.
  const isoTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
  if (!isoTime.test(completedAt) || !isoTime.test(requestedAt)) return false;
  const completionMs = Date.parse(completedAt), requestMs = Date.parse(requestedAt);
  if (!Number.isFinite(completionMs) || !Number.isFinite(requestMs)) return false;
  // Date.parse silently rolls 2026-02-31 into March. A normalized calendar
  // cannot be trusted as the processor's original completion timestamp.
  if (new Date(completionMs).toISOString().slice(0, 19) !== completedAt.slice(0, 19)
    || new Date(requestMs).toISOString().slice(0, 19) !== requestedAt.slice(0, 19)) return false;
  if (completionMs < requestMs || completionMs > Date.now() + 5 * 60_000) return false;
  if (typeof request.processor_run_id !== 'string' || !request.processor_run_id.trim()) return false;
  if (typeof request.erasure_policy_version !== 'string' || !request.erasure_policy_version.trim()) return false;
  if (typeof request.residual_manifest_version !== 'string' || !request.residual_manifest_version.trim()) return false;
  return nonNegativeInteger(request.deleted_count)
    && nonNegativeInteger(request.withdrawn_count)
    && nonNegativeInteger(request.retained_count);
}
