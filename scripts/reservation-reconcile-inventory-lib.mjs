// Credential-free preflight: a limit-sized runQuery result cannot prove
// complete inventory. Refuse reconciliation until full pagination is designed.
const PROJECT = 'tutop-beta-vicmdlb-1356585881';
const COLLECTIONS = new Set(['transactions_v2', 'listing_reservation_locks']);

export function assertCompleteReconciliationPage(rows, { projectId, collectionId, limit } = {}) {
  if (projectId !== PROJECT || !COLLECTIONS.has(collectionId)) throw new Error('RECONCILE_INVENTORY_SCOPE_INVALID');
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) throw new Error('RECONCILE_INVENTORY_LIMIT_INVALID');
  if (!Array.isArray(rows)) throw new Error('RECONCILE_INVENTORY_RESPONSE_INVALID');
  const prefix = `projects/${projectId}/databases/(default)/documents/${collectionId}/`;
  const seen = new Set();
  const documents = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row) || row.error) throw new Error('RECONCILE_INVENTORY_ROW_INVALID');
    if (!Object.hasOwn(row, 'document')) continue; // empty-query readTime row
    const document = row.document;
    const name = document?.name;
    const id = typeof name === 'string' && name.startsWith(prefix) ? name.slice(prefix.length) : '';
    if (!id || id.includes('/') || /[\u0000-\u001F\u007F]/.test(id)) throw new Error('RECONCILE_INVENTORY_PATH_INVALID');
    if (seen.has(name)) throw new Error('RECONCILE_INVENTORY_DUPLICATE_DOCUMENT');
    seen.add(name);
    documents.push(document);
  }
  // Equality is ambiguous: exactly `limit` documents might be a partial page.
  if (documents.length >= limit) throw new Error('RECONCILE_INVENTORY_INCOMPLETE');
  return documents;
}
