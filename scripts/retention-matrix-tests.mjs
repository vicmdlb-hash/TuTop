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

console.log(`PASS retention matrix covers ${collections.length} erasure-policy collections`);
console.log('PASS legal retention periods remain explicitly pending human review');
console.log('Retention/erasure matrix contract: PASS');
