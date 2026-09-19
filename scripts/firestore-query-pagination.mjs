export async function collectCursorPages(fetchPage, { pageSize = 500, maxPages = 10000 } = {}) {
  if (typeof fetchPage !== 'function') throw new Error('FETCH_PAGE_REQUIRED');
  const size = Math.max(1, Math.min(1000, Number(pageSize) || 500));
  const pageCap = Math.max(1, Math.min(100000, Number(maxPages) || 10000));
  const results = [];
  const seen = new Set();
  let afterName = '';

  for (let pageIndex = 0; pageIndex < pageCap; pageIndex += 1) {
    const page = await fetchPage({ afterName, pageSize: size });
    if (!Array.isArray(page)) throw new Error('QUERY_PAGE_INVALID');
    if (!page.length) return results;

    let lastName = '';
    for (const row of page) {
      const name = String(row?.name || '');
      if (!name) throw new Error('QUERY_CURSOR_NAME_MISSING');
      if (afterName && name <= afterName) throw new Error('QUERY_CURSOR_NOT_ADVANCING');
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
