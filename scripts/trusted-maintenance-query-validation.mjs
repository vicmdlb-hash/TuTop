// Source-only validation of finite Firestore runQuery inventories before a
// privileged maintenance task. No credentials, network, writes or side effects.
// A capacity preflight is not a snapshot lock: if the returned page reaches
// its limit, completeness is ambiguous and all subsequent writes must stop.
const STAGING_PROJECT = 'tutop-beta-vicmdlb-1356585881';
const ID = /^[A-Za-z0-9_-]{1,128}$/;
const fail = reason => { throw new Error('TRUSTED_MAINTENANCE_INVENTORY_' + reason); };

export function validateTrustedMaintenanceQueryRows({
  rows, projectId, collectionId, limit, decodeFields,
}) {
  if (projectId !== STAGING_PROJECT || !ID.test(collectionId || ''))
    fail('SCOPE_INVALID');
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500
    || typeof decodeFields !== 'function' || !Array.isArray(rows))
    fail('RESPONSE_INVALID');
  const prefix = 'projects/' + projectId
    + '/databases/(default)/documents/' + collectionId + '/';
  const seen = new Set();
  const documents = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row)
      || Object.hasOwn(row, 'error')) fail('ROW_INVALID');
    // A nonzero Firestore offset count means this inventory omitted records.
    // Do not allow it to authorize any privileged maintenance writes.
    if (Object.hasOwn(row, 'skippedResults')
      && (!Number.isSafeInteger(row.skippedResults) || row.skippedResults !== 0))
      fail('SKIPPED_RESULTS');
    if (!Object.hasOwn(row, 'document')) {
      // Empty queries yield readTime; completed streams may yield done=true.
      // Never silently interpret {} or malformed metadata as an empty result.
      const keys = Object.keys(row);
      const hasReadTime = Object.hasOwn(row, 'readTime')
        && typeof row.readTime === 'string' && Number.isFinite(Date.parse(row.readTime));
      const done = row.done === true;
      if (!keys.length || keys.some(key => !['readTime', 'skippedResults', 'done'].includes(key))
        || (Object.hasOwn(row, 'readTime') && !hasReadTime)
        || (Object.hasOwn(row, 'done') && !done)
        || (!hasReadTime && !done)) fail('ROW_UNEXPECTED');
      continue;
    }
    const doc = row.document;
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)
      || typeof doc.name !== 'string' || !doc.name.startsWith(prefix))
      fail('DOCUMENT_PATH_INVALID');
    const id = doc.name.slice(prefix.length);
    if (!ID.test(id)) fail('DOCUMENT_ID_INVALID');
    if (seen.has(id)) fail('DOCUMENT_DUPLICATED');
    seen.add(id);
    if (doc.fields !== undefined && (!doc.fields || typeof doc.fields !== 'object'
      || Array.isArray(doc.fields))) fail('FIELDS_INVALID');
    const decoded = decodeFields(doc.fields || {});
    if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded))
      fail('FIELDS_DECODE_INVALID');
    // The authoritative document path must override any client-editable id.
    documents.push({ ...decoded, id });
    if (documents.length >= limit) fail('PAGE_AT_LIMIT');
  }
  return documents;
}
