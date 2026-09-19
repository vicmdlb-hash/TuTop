export type AccountDeletionCompletionEvidenceLike = {
  status?: unknown;
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
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

export function hasTrustedAccountDeletionCompletion(
  request: AccountDeletionCompletionEvidenceLike | null | undefined,
) {
  if (!request || request.status !== 'completed' || request.auth_deleted !== true) return false;
  const completedAt = typeof request.completed_at === 'string' ? request.completed_at : '';
  if (!completedAt || Number.isNaN(Date.parse(completedAt))) return false;
  if (typeof request.processor_run_id !== 'string' || !request.processor_run_id.trim()) return false;
  if (typeof request.erasure_policy_version !== 'string' || !request.erasure_policy_version.trim()) return false;
  if (typeof request.residual_manifest_version !== 'string' || !request.residual_manifest_version.trim()) return false;
  return nonNegativeInteger(request.deleted_count)
    && nonNegativeInteger(request.withdrawn_count)
    && nonNegativeInteger(request.retained_count);
}
