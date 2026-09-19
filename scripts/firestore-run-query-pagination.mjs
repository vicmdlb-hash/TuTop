export function documentsFromRunQueryRows(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => row?.document)
    .filter(Boolean);
}

export async function paginateRunQueryByDocumentName({
  baseQuery,
  runPage,
  pageSize = 500,
  maxPages = 10000,
}) {
  const size = Math.max(1, Math.min(1000, Number(pageSize) || 500));
  const results = [];
  let cursorName = '';
  let priorCursor = '';

  for (let page = 0; page < maxPages; page += 1) {
    const structuredQuery = {
      ...baseQuery,
      orderBy: [{ field: { fieldPath: '__name__' }, direction: 'ASCENDING' }],
      limit: size,
      ...(cursorName ? {
        startAt: {
          values: [{ referenceValue: cursorName }],
          // Firestore StructuredQuery Cursor: before=false = START AFTER.
          before: false,
        },
      } : {}),
    };

    const rows = await runPage(structuredQuery);
    const documents = documentsFromRunQueryRows(rows);
    if (!documents.length) return results;

    for (const document of documents) results.push(document);

    const lastName = String(documents.at(-1)?.name || '');
    if (!lastName || lastName === cursorName || lastName === priorCursor) {
      throw new Error('FIRESTORE_QUERY_CURSOR_DID_NOT_ADVANCE');
    }
    priorCursor = cursorName;
    cursorName = lastName;

    if (documents.length < size) return results;
  }

  throw new Error('FIRESTORE_QUERY_PAGINATION_MAX_PAGES');
}
