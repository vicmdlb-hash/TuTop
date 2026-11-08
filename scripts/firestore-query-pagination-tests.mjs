import assert from 'node:assert/strict';
import fs from 'node:fs';
import { collectCursorPages, collectTokenPages, parseFirestoreRunQueryRows, assertAdminDocumentResponse, collectAuthAccountPages } from './firestore-query-pagination.mjs';

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
// Staging reset must inventory every orphan chat subcollection with the same
// fail-closed cursor pagination used by account erasure, never one raw runQuery.
const groupListStart = admin.indexOf('export async function adminListCollectionGroupDocuments(');
const groupListEnd = admin.indexOf('export async function adminListDocuments(', groupListStart);
assert(groupListStart >= 0 && groupListEnd > groupListStart, 'staging group inventory function must exist');
const groupList = admin.slice(groupListStart, groupListEnd);
assert.match(groupList, /return adminRunCollectionGroupQueryAll\(clean, \[\], 500\);/);
assert.doesNotMatch(groupList, /const rows = await request\(|runStructuredQuery\(/);
assert.match(admin, /from: \[\{ collectionId: clean, allDescendants: true \}\]/);
const reset = fs.readFileSync('scripts/reset-staging-accounts.mjs', 'utf8');
assert.match(reset, /adminListCollectionGroupDocuments\(subcollection\)/);
assert.match(admin, /collectTokenPages/);
assert.match(admin, /fieldPath: '__name__'/);
assert.match(admin, /startAt: \{ values: \[\{ referenceValue: afterName \}\], before: false \}/);
assert.doesNotMatch(admin, /offset:/);
assert.match(processor, /adminRunQueryAll/);
assert.equal(processor.includes('adminRunQuery('), false);
assert.match(processor, /ACCOUNT_ERASURE_QUERY_RESIDUAL/);
assert.match(processor, /ACCOUNT_ERASURE_DIRECT_RESIDUAL/);
assert.match(processor, /ACCOUNT_ERASURE_WITHDRAW_RESIDUAL/);


const firestoreName = 'projects/demo/databases/(default)/documents/chats/chat1';
const accepted = parseFirestoreRunQueryRows([
  { readTime: '2026-11-05T12:00:00Z' },
  { document: { name: firestoreName, fields: { uid: { stringValue: 'synthetic-user' } } } },
]);
assert.deepEqual(accepted, [{
  name: firestoreName, path: 'chats/chat1',
  fields: { uid: { stringValue: 'synthetic-user' } },
}]);
assert.deepEqual(parseFirestoreRunQueryRows([]), []);
// A successful HTTP response can still skip results; never treat it as a
// complete deletion inventory. This test is pure and makes no Firebase calls.
assert.throws(() => parseFirestoreRunQueryRows([
  { readTime: '2026-11-08T00:00:00Z', skippedResults: 2 },
]), /QUERY_SKIPPED_RESULTS_UNSAFE/);
assert.throws(() => parseFirestoreRunQueryRows([
  { document: { name: firestoreName, fields: {} }, skippedResults: 1 },
]), /QUERY_SKIPPED_RESULTS_UNSAFE/);
assert.deepEqual(parseFirestoreRunQueryRows([
  { readTime: '2026-11-08T00:00:00Z', skippedResults: 0 },
]), []);

for (const malformed of [
  null, {}, { error: { code: 403, message: 'denied' } },
  { document: null }, { document: {} },
  { document: { name: 'users/user1' } },
  { document: { name: 'projects/demo/databases/(default)/documents/chats' } },
  { document: { name: firestoreName, fields: 'invalid' } },
]) {
  assert.throws(() => parseFirestoreRunQueryRows([malformed]),
    /QUERY_RESPONSE_ROW_INVALID|QUERY_DOCUMENT_INVALID/);
}
assert.throws(() => parseFirestoreRunQueryRows(null), /QUERY_RESPONSE_INVALID/);
// A 200 status with an in-band Firestore error must never be mistaken for
// an exhausted residual inventory.
await assert.rejects(
  collectTokenPages(async () => ({ error: { status: 'PERMISSION_DENIED' } })),
  /LIST_PAGE_REMOTE_ERROR/,
);
assert.match(admin, /parseFirestoreRunQueryRows\(rows\)/);

const expectedDocumentName = 'projects/demo/databases/(default)/documents/users/test-user';
const validDoc = { name: expectedDocumentName, fields: { flag: { booleanValue: true } } };
assert.equal(assertAdminDocumentResponse(validDoc, expectedDocumentName), validDoc);
for (const invalid of [
  null, [], {}, { name: 'projects/demo/databases/(default)/documents/users/other' },
  { name: expectedDocumentName, fields: 'invalid' },
  { name: expectedDocumentName, fields: null },
  { name: expectedDocumentName, fields: [] },
]) {
  assert.throws(() => assertAdminDocumentResponse(invalid, expectedDocumentName),
    /FIREBASE_ADMIN_DOCUMENT_INVALID/);
}
assert(admin.includes('assertAdminDocumentResponse(result,'));
assert(admin.includes("throw new Error('FIREBASE_ADMIN_HTTP_' + response.status)"));
assert(admin.includes("throw new Error('FIREBASE_ADMIN_EMPTY_GET_RESPONSE')"));
assert(!admin.includes('text.slice(0, 800)'), 'No raw provider error body in logs');
assert(!admin.includes('catch { return text; }'), 'Malformed JSON must not pass as a successful response');

// AUTH_LIST_PAGE_SYNTHETIC_TEST — no Firebase calls or real identities.
const syntheticAccounts = Array.from({ length: 2505 }, (_, i) => ({
  localId: `synthetic_${String(i).padStart(6, '0')}`,
  email: `synthetic${i}@example.invalid`,
}));
let authPageCalls = 0;
const authPages = await collectAuthAccountPages(async ({ pageToken, pageSize }) => {
  authPageCalls += 1;
  const start = pageToken ? Number(pageToken) : 0;
  const users = syntheticAccounts.slice(start, start + pageSize);
  return { users, nextPageToken: start + users.length < syntheticAccounts.length
    ? String(start + users.length) : '' };
}, { pageSize: 500 });
assert.equal(authPages.length, 2505);
assert.equal(new Set(authPages.map(user => user.localId)).size, 2505);
assert.equal(authPageCalls, 6);
assert.deepEqual(await collectAuthAccountPages(async () => ({})), []);
for (const page of [null, [], { error: { code: 403 } },
  { users: 'malformed' }, { users: [{ email: 'missing-uid@example.invalid' }] },
  { users: [{ localId: ' invalid-uid ' }] },
  { users: [{ localId: 'ok', email: 123 }] },
  { users: [{ localId: 'x' }, { localId: 'x' }] },
  { nextPageToken: 4 },
]) {
  await assert.rejects(collectAuthAccountPages(async () => page),
    /AUTH_PAGE_INVALID|AUTH_USERS_INVALID|AUTH_USER_INVALID|AUTH_USER_DUPLICATE|AUTH_TOKEN_INVALID/);
}
await assert.rejects(collectAuthAccountPages(async () => ({
  users: [{ localId: 'same-uid' }], nextPageToken: 'again',
})), /AUTH_USER_DUPLICATE|AUTH_TOKEN_CYCLE/);
await assert.rejects(collectAuthAccountPages(async () => ({
  users: [], nextPageToken: 'new-token',
}), { maxPages: 2 }), /AUTH_TOKEN_CYCLE|AUTH_PAGE_LIMIT_EXCEEDED/);
await assert.rejects(collectAuthAccountPages(async () => ({
  users: [{ localId: 'valid-uid' }, { localId: 'second' }],
}), { pageSize: 1 }), /AUTH_USERS_INVALID/);
assert.match(admin, /accounts:batchGet/);
assert.doesNotMatch(admin, /\/accounts:query/);
assert.match(admin, /collectAuthAccountPages/);
assert.match(admin, /params\.set\('nextPageToken', pageToken\)/);
const authListSource = admin.slice(admin.indexOf('export async function adminListAuthUsers'),
  admin.indexOf('export async function adminAssertAuthUserAbsent'));
assert.match(authListSource, /method: 'GET'/);
assert.doesNotMatch(authListSource, /method: 'POST'/);

console.log('PASS erasure query pagination covers 2505 rows with stable __name__ cursor and fails closed on cursor drift');
