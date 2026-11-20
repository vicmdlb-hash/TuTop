import assert from 'node:assert/strict';
import fs from 'node:fs';

const policy = fs.readFileSync('src/lib/accountErasurePolicy.ts', 'utf8');
const matrix = fs.readFileSync('docs/RETENTION_ERASURE_MATRIX_0.9.md', 'utf8');
const collections = [...policy.matchAll(/collection: '([^']+)'/g)].map((match) => match[1]);
assert(collections.length >= 20, 'expected complete erasure policy');
for (const collection of collections) assert(matrix.includes(`\`${collection}\``), `matrix missing ${collection}`);
const rules = [...policy.matchAll(/\{\s*collection:\s*'([^']+)'(?:,\s*owner_field:\s*'[^']+')?,\s*disposition:\s*'(delete|withdraw|retain_operational)'/g)]
  .map((match) => ({ collection: match[1], disposition: match[2] }));
assert.equal(rules.length, collections.length, 'every erasure rule must declare a disposition');
assert.equal(new Set(rules.map((rule) => rule.collection)).size, rules.length, 'duplicate erasure collection');
const matrixRows = new Map(
  matrix.split('\n')
    .map((line) => line.split('|').map((cell) => cell.trim()))
    .filter((cells) => cells.length >= 6 && /^`[^`]+`/.test(cells[1]))
    .map((cells) => [cells[1].match(/^`([^`]+)`/)[1], cells[3]]),
);
assert.equal(matrixRows.size, rules.length, 'retention matrix must have one row per erasure rule');
const expectedActions = {
  delete: /^Eliminar\b/i,
  withdraw: /^Retirar\/anonimizar\b/i,
  retain_operational: /^Retener (?:operacionalmente|mientras la operación)\b/i,
};
for (const rule of rules) {
  const action = matrixRows.get(rule.collection);
  assert.ok(action && expectedActions[rule.disposition].test(action),
    `retention disposition mismatch: ${rule.collection} (${rule.disposition})`);
}

assert.match(matrix, /PENDIENTE LEGAL/);
assert.match(matrix, /no sustituye asesoría jurídica/i);
assert.match(matrix, /idempotente, auditable/i);
assert.doesNotMatch(matrix, /retener por \d+ (años|meses|días)/i);

console.log(`PASS retention matrix covers ${collections.length} erasure-policy collections`);
console.log('PASS legal retention periods remain explicitly pending human review');
console.log('Retention/erasure matrix contract: PASS');
