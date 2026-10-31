// Browser-readable, read-only deletion status validation.
// A field saying "completed" is not independent Auth deletion proof. The
// trusted runner records all of these fields atomically with its audit entry.
const isoUtc = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/;

function safeCount(value) {
  const raw = value?.integerValue;
  if (typeof raw !== 'string' || !/^(0|[1-9]\d*)$/.test(raw)) return false;
  return Number.isSafeInteger(Number(raw));
}


function canonicalUtcSortKey(iso) {
  // Both fields have already passed strict UTC syntax and calendar checks.
  // Convert optional RFC3339 fractional seconds to fixed nanosecond precision.
  // Date.parse alone truncates sub-millisecond ordering.
  return iso.slice(0, 19) + '.' + (iso.length > 20 ? iso.slice(20, -1).padEnd(9, '0') : '000000000');
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
  // Date.parse normalizes impossible days (e.g. February 31). Never infer
  // a completed erasure from a calendar-normalized processor timestamp.
  if (new Date(requestedMs).toISOString().slice(0, 19) !== requestedAt.slice(0, 19)
    || new Date(completedMs).toISOString().slice(0, 19) !== completedAt.slice(0, 19)) {
    return 'completion-unverified';
  }
  if (canonicalUtcSortKey(completedAt) < canonicalUtcSortKey(requestedAt)) return 'completion-unverified';
  return 'completed';
}
