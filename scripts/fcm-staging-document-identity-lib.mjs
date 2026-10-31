// Pure fail-closed binding between authoritative Firestore document.name and
// decoded user/admin-provided fields. No credentials, SDK or network access.
const ROOT = 'projects/tutop-beta-vicmdlb-1356585881/databases/(default)/documents';
const QUERY_COLLECTIONS = new Set(['device_tokens', 'notification_outbox']);

function canonicalRecord(document, expectedPath, decode, includeVersion) {
  if (!document || typeof document !== 'object'
      || typeof expectedPath !== 'string'
      || document.name !== `${ROOT}/${expectedPath}`
      || typeof decode !== 'function') {
    throw new Error('FCM_DOCUMENT_NAME_MISMATCH');
  }
  const id = expectedPath.split('/').at(-1);
  if (!id || id === '.' || id === '..' || id.length > 1500
      || id.includes('/') || id.includes('\\0')) {
    throw new Error('FCM_DOCUMENT_ID_INVALID');
  }
  const fields = decode(document.fields || {});
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) {
    throw new Error('FCM_DOCUMENT_FIELDS_INVALID');
  }
  // Never let a stored "id" field replace the Firestore document path ID.
  if (Object.hasOwn(fields, 'id') && fields.id !== id) {
    throw new Error('FCM_DOCUMENT_FIELD_ID_CONFLICT');
  }
  if (includeVersion && (typeof document.updateTime !== 'string'
      || !Number.isFinite(Date.parse(document.updateTime)))) {
    throw new Error('FCM_DOCUMENT_UPDATE_TIME_REQUIRED');
  }
  return {
    ...fields,
    id,
    ...(includeVersion ? { _document_update_time: document.updateTime } : {}),
  };
}

export function trustedFcmQueryRecord(document, collectionId, decode) {
  if (!QUERY_COLLECTIONS.has(collectionId)
      || typeof document?.name !== 'string') {
    throw new Error('FCM_QUERY_DOCUMENT_INVALID');
  }
  const prefix = `${ROOT}/${collectionId}/`;
  if (!document.name.startsWith(prefix)) throw new Error('FCM_QUERY_DOCUMENT_PATH_INVALID');
  const id = document.name.slice(prefix.length);
  if (!id || id.includes('/')) throw new Error('FCM_QUERY_DOCUMENT_PATH_INVALID');
  return canonicalRecord(document, `${collectionId}/${id}`, decode, true);
}

export function trustedFcmDirectRecord(document, expectedPath, decode) {
  const parts = typeof expectedPath === 'string' ? expectedPath.split('/') : [];
  const validChat = parts.length === 2 && parts[0] === 'chats';
  const validBlock = parts.length === 4 && parts[0] === 'user_blocks'
    && parts[2] === 'targets';
  if (!validChat && !validBlock) throw new Error('FCM_DIRECT_DOCUMENT_PATH_INVALID');
  if (parts.some(x => !x || x === '.' || x === '..')) throw new Error('FCM_DIRECT_DOCUMENT_PATH_INVALID');
  return canonicalRecord(document, expectedPath, decode, false);
}
