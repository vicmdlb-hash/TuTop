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
