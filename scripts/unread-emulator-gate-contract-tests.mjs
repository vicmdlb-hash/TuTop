import fs from 'node:fs';
import assert from 'node:assert/strict';

const fixture = fs.readFileSync('tests/firestore.v2.unread-aggregation.test.mjs', 'utf8');
const firestoreWorkflow = fs.readFileSync('.github/workflows/firestore-v2-security.yml', 'utf8');
const octoberWorkflow = fs.readFileSync('.github/workflows/october-01-validation.yml', 'utf8');

assert.match(fixture, /getCountFromServer/);
assert.match(fixture, /UNREAD_COUNT_MISMATCH/);
assert.match(fixture, /UNREAD_AFTER_MARKER_MISMATCH/);
assert.match(fixture, /authenticatedContext\('eve'\)/);
assert.match(fixture, /assertFails\(getCountFromServer\(q\)\)/);
assert.match(fixture, /reads\/alice/);
assert.match(fixture, /assertFails\(updateDoc\(doc\(bob/);

for (const workflow of [firestoreWorkflow, octoberWorkflow]) {
  assert.match(workflow, /^\s*workflow_dispatch:\s*$/m);
  assert.doesNotMatch(workflow, /^\s*(push|pull_request|schedule):\s*$/m);
  assert.match(workflow, /tests\/firestore\.v2\.unread-aggregation\.test\.mjs/);
}

console.log('PASS unread aggregation emulator fixture covers exact count, outsider denial and read-marker ownership');
console.log('PASS both emulator gates remain manual-only and include unread aggregation validation');
console.log('Unread emulator gate contract: PASS');
