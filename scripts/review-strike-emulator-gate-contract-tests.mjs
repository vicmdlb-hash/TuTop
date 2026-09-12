import fs from 'node:fs';
import assert from 'node:assert/strict';

const security = fs.readFileSync('.github/workflows/firestore-v2-security.yml', 'utf8');
const october = fs.readFileSync('.github/workflows/october-01-validation.yml', 'utf8');
const fixture = fs.readFileSync('tests/firestore.v2.review-strike-aggregation.test.mjs', 'utf8');

for (const workflow of [security, october]) {
  assert.match(workflow, /on:\s*\n\s*workflow_dispatch:/);
  assert.doesNotMatch(workflow, /schedule:/);
  assert.match(workflow, /tests\/firestore\.v2\.review-strike-aggregation\.test\.mjs/);
}

assert.match(fixture, /getCountFromServer/);
assert.match(fixture, /where\('evaluado_id', '==', uid\)/);
assert.match(fixture, /where\('calificacion', '==', 'negative'\)/);
assert.match(fixture, /where\('fecha', '>=', ts\(cutoffMillis\)\)/);
assert.match(fixture, /STRIKE_COUNT_MISMATCH/);
assert.match(fixture, /assertFails\(getCountFromServer/);

console.log('PASS review strike aggregation fixture is wired into both manual emulator gates');
console.log('PASS workflows remain manual-only during the Actions outage');
console.log('PASS fixture locks 30-day negative-received review semantics and privacy');
console.log('Review strike emulator gate contract: PASS');
