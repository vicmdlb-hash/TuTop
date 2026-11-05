// Fail closed on in-band query errors or malformed document envelopes.
// Firestore may return readTime-only metadata rows for an empty result set;
// these are not equivalent to arbitrary, silently discarded response objects.
export function parseFirestoreRunQueryRows(rows) {
  if (!Array.isArray(rows)) throw new Error('QUERY_RESPONSE_INVALID');
  const results = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row)
        || Object.prototype.hasOwnProperty.call(row, 'error')) {
      throw new Error('QUERY_RESPONSE_ROW_INVALID');
    }
    if (!Object.prototype.hasOwnProperty.call(row, 'document')) {
      if (!('readTime' in row) && !('skippedResults' in row)
          && !('explainMetrics' in row)) throw new Error('QUERY_RESPONSE_ROW_INVALID');
      continue;
    }
    const doc = row.document;
    const name = doc?.name;
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)
        || typeof name !== 'string'
        || !name.startsWith('projects/') || !name.includes('/databases/') || !name.includes('/documents/')) {
      throw new Error('QUERY_DOCUMENT_INVALID');
    }
    const relativePath = name.split('/documents/')[1];
    if (!relativePath || relativePath.split('/').length % 2 !== 0
        || (doc.fields !== undefined
            && (!doc.fields || typeof doc.fields !== 'object' || Array.isArray(doc.fields)))) {
      throw new Error('QUERY_DOCUMENT_INVALID');
    }
    results.push({ name, path: relativePath, fields: doc.fields || {} });
  }
  return results;
}

// An unexpected successful GET document cannot prove that an account was deleted.
export function assertAdminDocumentResponse(document, expectedName) {
  if (!document || typeof document !== 'object' || Array.isArray(document)
      || typeof expectedName !== 'string' || document.name !== expectedName
      || (document.fields !== undefined
          && (!document.fields || typeof document.fields !== 'object'
              || Array.isArray(document.fields)))) {
    throw new Error('FIREBASE_ADMIN_DOCUMENT_INVALID');
  }
  return document;
}

export async function collectCursorPages(fetchPage, { pageSize = 500, maxPages = 10000 } = {}) {
  if (typeof fetchPage !== 'function') throw new Error('FETCH_PAGE_REQUIRED');
  const size = Math.max(1, Math.min(1000, Number(pageSize) || 500));
  const pageCap = Math.max(1, Math.min(100000, Number(maxPages) || 10000));
  const results = [];
  const seen = new Set();
  let afterName = '';

  for (let pageIndex = 0; pageIndex < pageCap; pageIndex += 1) {
    const page = await fetchPage({ afterName, pageSize: size });
    if (!Array.isArray(page) || page.length > size) throw new Error('QUERY_PAGE_INVALID');
    if (!page.length) return results;

    let lastName = '';
    for (const row of page) {
      const name = String(row?.name || '');
      if (!name) throw new Error('QUERY_CURSOR_NAME_MISSING');
      if (afterName && name <= afterName) throw new Error('QUERY_CURSOR_NOT_ADVANCING');
      if (lastName && name <= lastName) throw new Error('QUERY_PAGE_OUT_OF_ORDER');
      if (seen.has(name)) throw new Error('QUERY_CURSOR_DUPLICATE');
      seen.add(name);
      results.push(row);
      lastName = name;
    }

    if (!lastName || lastName === afterName) throw new Error('QUERY_CURSOR_STALLED');
    afterName = lastName;
    if (page.length < size) return results;
  }

  throw new Error('QUERY_PAGE_LIMIT_EXCEEDED');
}

/**
 * Firestore listDocuments uses opaque page tokens, unlike runQuery __name__
 * cursors. Stop on malformed pages, repeated tokens/documents or excessive
 * pagination: a truncated deletion inventory must never appear exhaustive.
 */
export async function collectTokenPages(fetchPage, { pageSize = 300, maxPages = 10000 } = {}) {
  if (typeof fetchPage !== 'function') throw new Error('LIST_FETCH_REQUIRED');
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 1000
      || !Number.isSafeInteger(maxPages) || maxPages < 1 || maxPages > 100000)
    throw new Error('LIST_PAGE_OPTIONS_INVALID');
  const seenTokens = new Set();
  const seenNames = new Set();
  const results = [];
  let pageToken = '';
  for (let i = 0; i < maxPages; i += 1) {
    const raw = await fetchPage({ pageToken, pageSize });
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
      throw new Error('LIST_PAGE_INVALID');
    if (Object.prototype.hasOwnProperty.call(raw, 'error'))
      throw new Error('LIST_PAGE_REMOTE_ERROR');
    const docs = raw.documents === undefined ? [] : raw.documents;
    if (!Array.isArray(docs) || docs.length > pageSize)
      throw new Error('LIST_DOCUMENTS_INVALID');
    for (const doc of docs) {
      const name = doc?.name;
      if (typeof name !== 'string' || !name.includes('/documents/'))
        throw new Error('LIST_DOCUMENT_NAME_INVALID');
      if (seenNames.has(name)) throw new Error('LIST_DOCUMENT_DUPLICATE');
      seenNames.add(name);
      results.push(doc);
    }
    const next = raw.nextPageToken ?? '';
    if (typeof next !== 'string') throw new Error('LIST_PAGE_TOKEN_INVALID');
    if (!next) return results;
    if (next === pageToken || seenTokens.has(next))
      throw new Error('LIST_PAGE_TOKEN_CYCLE');
    seenTokens.add(next);
    pageToken = next;
  }
  throw new Error('LIST_PAGE_LIMIT_EXCEEDED');
}
