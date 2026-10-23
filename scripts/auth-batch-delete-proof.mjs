// Identity Platform batchDelete can return HTTP 200 with per-account failures.
// Keep error messages, UIDs and provider responses out of logs.
export function assertAuthBatchDeleteResponse(result) {
  if (!result || typeof result !== 'object' || Array.isArray(result))
    throw new Error('AUTH_BATCH_DELETE_RESPONSE_INVALID');
  if (result.errors === undefined) return true; // Omitted on complete success.
  if (!Array.isArray(result.errors))
    throw new Error('AUTH_BATCH_DELETE_ERRORS_MALFORMED');
  if (result.errors.length)
    throw new Error('AUTH_BATCH_DELETE_PARTIAL_FAILURE');
  return true;
}
