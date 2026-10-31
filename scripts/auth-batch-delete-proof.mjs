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

/**
 * Confirm an admin OAuth lookup by localId found no account. Never infer
 * deletion from HTTP status alone or from an error/partial response.
 * The successful empty-object result represents zero matching users.
 */
export function assertAuthAccountAbsent(result, uid) {
  if (typeof uid !== 'string' || !/^[A-Za-z0-9_-]{8,128}$/.test(uid))
    throw new Error('AUTH_LOOKUP_UID_INVALID');
  if (!result || typeof result !== 'object' || Array.isArray(result)
      || Object.hasOwn(result, 'error') || Object.hasOwn(result, 'errors'))
    throw new Error('AUTH_LOOKUP_RESPONSE_INVALID');
  if (result.users === undefined) return true;
  if (!Array.isArray(result.users)) throw new Error('AUTH_LOOKUP_USERS_MALFORMED');
  if (result.users.length !== 0) throw new Error('AUTH_LOOKUP_NOT_CONFIRMED_ABSENT');
  return true;
}
