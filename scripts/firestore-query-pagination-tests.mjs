import assert from 'node:assert/strict';
import fs from 'node:fs';
import { collectCursorPages, collectTokenPages } from './firestore-query-pagination.mjs';

const docs = Array.from({ length: 2505 }, (_, index) => ({
  name: `projects/demo/databases/(default)/documents/items/${String(index).padStart(5, '0')}`,
  path: `items/${String(index).padStart(5, '0')}`,
}));

let calls = 0;
const result = await collectCursorPages(async ({ afterName, pageSize }) => {
  calls += 1;
  const start = afterName ? docs.findIndex((doc) => doc.name === afterName) + 1 : 0;
  return docs.slice(start, start + pageSize);
}, { pageSize: 500 });

assert.equal(result.length, 2505);
assert.equal(new Set(result.map((item) => item.name)).size, 2505);
assert.equal(result[0].name, docs[0].name);
assert.equal(result.at(-1).name, docs.at(-1).name);
assert.equal(calls, 6, '2505 rows at pageSize=500 should use six cursor pages');

await assert.rejects(
  collectCursorPages(async ({ afterName }) => [{ name: afterName || docs[0].name }], { pageSize: 1, maxPages: 3 }),
  /QUERY_CURSOR_NOT_ADVANCING/,
);

await assert.rejects(
  collectCursorPages(async () => [{ path: 'missing-name' }], { pageSize: 1 }),
  /QUERY_CURSOR_NAME_MISSING/,
);

// Firestore listDocuments pagination must never silently accept a partial
// inventory or a looped nextPageToken (synthetic, no Firebase calls).
const listDocs = Array.from({ length: 1205 }, (_, i) => ({
  name: `projects/demo/databases/(default)/documents/chats/ch-1/messages/${i}`,
}));
const tokens = await collectTokenPages(async ({ pageToken, pageSize }) => {
  const begin = pageToken ? Number(pageToken) : 0;
  const documents = listDocs.slice(begin, begin + pageSize);
  const nextPageToken = begin + documents.length < listDocs.length
    ? String(begin + documents.length) : '';
  return { documents, nextPageToken };
}, { pageSize: 300 });
assert.equal(tokens.length, 1205);
await assert.rejects(
  collectTokenPages(async () => ({ documents: [listDocs[0]], nextPageToken: 'again' }),
    { pageSize: 300, maxPages: 3 }), /LIST_DOCUMENT_DUPLICATE|LIST_PAGE_TOKEN_CYCLE/,
);
await assert.rejects(
  collectTokenPages(async () => ({ documents: [listDocs[0], listDocs[0]] }),
    { pageSize: 300 }), /LIST_DOCUMENT_DUPLICATE/,
);
await assert.rejects(collectTokenPages(async () => null), /LIST_PAGE_INVALID/);
await assert.rejects(
  collectTokenPages(async () => ({ documents: 'malformed' })),
  /LIST_DOCUMENTS_INVALID/,
);
await assert.rejects(
  collectTokenPages(async () => ({ documents: [], nextPageToken: 123 })),
  /LIST_PAGE_TOKEN_INVALID/,
);
await assert.rejects(
  collectCursorPages(async () => [docs[2], docs[1]], { pageSize: 2 }),
  /QUERY_PAGE_OUT_OF_ORDER/,
);
await assert.rejects(
  collectCursorPages(async () => docs.slice(0, 3), { pageSize: 2 }),
  /QUERY_PAGE_INVALID/,
);

const admin = fs.readFileSync('scripts/staging-v2-admin.mjs','utf8');
const processor = fs.readFileSync('scripts/process-account-erasure.mjs','utf8');
assert.match(admin, /export async function adminRunQueryAll/);
assert.match(admin, /collectTokenPages/);
assert.match(admin, /fieldPath: '__name__'/);
assert.match(admin, /startAt: \{ values: \[\{ referenceValue: afterName \}\], before: false \}/);
assert.doesNotMatch(admin, /offset:/);
assert.match(processor, /adminRunQueryAll/);
assert.equal(processor.includes('adminRunQuery('), false);
assert.match(processor, /ACCOUNT_ERASURE_QUERY_RESIDUAL/);
assert.match(processor, /ACCOUNT_ERASURE_DIRECT_RESIDUAL/);
assert.match(processor, /ACCOUNT_ERASURE_WITHDRAW_RESIDUAL/);

console.log('PASS erasure query pagination covers 2505 rows with stable __name__ cursor and fails closed on cursor drift');
