import assert from 'node:assert/strict';
import fs from 'node:fs';

const policy = fs.readFileSync('src/lib/accountErasurePolicy.ts', 'utf8');
const matrix = fs.readFileSync('docs/RETENTION_ERASURE_MATRIX_0.9.md', 'utf8');
const collections = [...policy.matchAll(/collection: '([^']+)'/g)].map((match) => match[1]);
assert(collections.length >= 20, 'expected complete erasure policy');
for (const collection of collections) assert(matrix.includes(`\`${collection}\``), `matrix missing ${collection}`);
assert.match(matrix, /PENDIENTE LEGAL/);
assert.match(matrix, /no sustituye asesoría jurídica/i);
assert.match(matrix, /idempotente, auditable/i);
assert.doesNotMatch(matrix, /retener por \d+ (años|meses|días)/i);
for (const token of [
  '0.9.2-beta.11',
  '90215',
  '579bdecd7e193b8661276f114b9d3e097792d8d6',
  '10835643904',
  'acd939e5aa4d078270b2fb485e9a41741638e4501cd3c3167871c9ca7bc6f6b8',
  '192B19F3E67ED7B69FA6862429E232B892979A6C8C97800845F6A1D1948FF79A',
]) assert(matrix.includes(token), `matrix missing exact Build121 evidence token: ${token}`);
assert.match(matrix, /no constituye aprobación legal, Data Safety final, autorización de Play ni release/i);
assert.match(matrix, /no.*redacción genérica de domicilios\/direcciones/i);

console.log(`PASS retention matrix covers ${collections.length} erasure-policy collections`);
console.log('PASS legal retention periods remain explicitly pending human review');
console.log('PASS retention matrix is bound to exact Build121 engineering evidence without legal approval');
console.log('Retention/erasure matrix contract: PASS');
