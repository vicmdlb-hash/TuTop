import assert from 'node:assert/strict';
import fs from 'node:fs';
import { collectCursorPages } from './firestore-query-pagination.mjs';

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

const admin = fs.readFileSync('scripts/staging-v2-admin.mjs','utf8');
const processor = fs.readFileSync('scripts/process-account-erasure.mjs','utf8');
assert.match(admin, /export async function adminRunQueryAll/);
assert.match(admin, /fieldPath: '__name__'/);
assert.match(admin, /startAt: \{ values: \[\{ referenceValue: afterName \}\], before: false \}/);
assert.doesNotMatch(admin, /offset:/);
assert.match(processor, /adminRunQueryAll/);
assert.equal(processor.includes('adminRunQuery('), false);
assert.match(processor, /ACCOUNT_ERASURE_QUERY_RESIDUAL/);
assert.match(processor, /ACCOUNT_ERASURE_DIRECT_RESIDUAL/);
assert.match(processor, /ACCOUNT_ERASURE_WITHDRAW_RESIDUAL/);

console.log('PASS erasure query pagination covers 2505 rows with stable __name__ cursor and fails closed on cursor drift');
