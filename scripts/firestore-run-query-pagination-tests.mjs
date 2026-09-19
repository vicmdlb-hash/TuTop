import assert from 'node:assert/strict';
import { paginateRunQueryByDocumentName } from './firestore-run-query-pagination.mjs';

const prefix = 'projects/demo/databases/(default)/documents/favorites/';
const documents = Array.from({ length: 1205 }, (_, index) => ({
  name: prefix + String(index).padStart(5, '0'),
  fields: { uid: { stringValue: 'user-1' } },
}));

const pageSizes = [];
const result = await paginateRunQueryByDocumentName({
  baseQuery: {
    from: [{ collectionId: 'favorites' }],
    where: { fieldFilter: { field: { fieldPath: 'uid' }, op: 'EQUAL', value: { stringValue: 'user-1' } } },
  },
  pageSize: 500,
  runPage: async (query) => {
    assert.deepEqual(query.orderBy, [{ field: { fieldPath: '__name__' }, direction: 'ASCENDING' }]);
    const cursor = query.startAt?.values?.[0]?.referenceValue || '';
    const start = cursor ? documents.findIndex((item) => item.name === cursor) + 1 : 0;
    assert(cursor === '' || query.startAt?.before === false);
    const page = documents.slice(start, start + query.limit);
    pageSizes.push(page.length);
    return page.map((document) => ({ document }));
  },
});

assert.equal(result.length, 1205);
assert.equal(new Set(result.map((item) => item.name)).size, 1205);
assert.deepEqual(result.map((item) => item.name), documents.map((item) => item.name));
assert.deepEqual(pageSizes, [500, 500, 205]);

let stuck = false;
try {
  await paginateRunQueryByDocumentName({
    baseQuery: { from: [{ collectionId: 'x' }] },
    pageSize: 1,
    runPage: async () => [{ document: { name: prefix + 'same', fields: {} } }],
  });
} catch (error) {
  stuck = /CURSOR_DID_NOT_ADVANCE/.test(String(error));
}
assert.equal(stuck, true);

console.log('PASS runQuery pagination traverses 1205 documents exactly once');
console.log('PASS cursor is stable __name__ ASC and START AFTER');
console.log('PASS non-advancing cursor fails closed');
