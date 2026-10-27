// Browser-readable, read-only deletion status validation.
// A field saying "completed" is not independent Auth deletion proof. The
// trusted runner records all of these fields atomically with its audit entry.
const isoUtc = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/;

function safeCount(value) {
  const raw = value?.integerValue;
  if (typeof raw !== 'string' || !/^(0|[1-9]\d*)$/.test(raw)) return false;
  return Number.isSafeInteger(Number(raw));
}

export function trustedWebDeletionStatus(document, now = Date.now()) {
  const fields = document?.fields;
  const status = fields?.status?.stringValue;
  if (status !== 'completed') {
    return ['pending', 'processing', 'rejected'].includes(status) ? status : 'unknown';
  }
  const requestedAt = fields?.requested_at?.timestampValue;
  const completedAt = fields?.completed_at?.timestampValue;
  if (fields?.auth_deleted?.booleanValue !== true
    || typeof requestedAt !== 'string' || !isoUtc.test(requestedAt)
    || typeof completedAt !== 'string' || !isoUtc.test(completedAt)
    || !fields?.processor_run_id?.stringValue?.trim()
    || !fields?.erasure_policy_version?.stringValue?.trim()
    || !fields?.residual_manifest_version?.stringValue?.trim()
    || !['deleted_count', 'withdrawn_count', 'retained_count'].every(k => safeCount(fields[k]))) {
    return 'completion-unverified';
  }
  const requestedMs = Date.parse(requestedAt);
  const completedMs = Date.parse(completedAt);
  if (!Number.isFinite(requestedMs) || !Number.isFinite(completedMs)
    || completedMs < requestedMs || completedMs > now + 5 * 60_000) {
    return 'completion-unverified';
  }
  return 'completed';
}
