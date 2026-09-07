import fs from 'node:fs';
import assert from 'node:assert/strict';

const android = fs.readFileSync('.github/workflows/android-debug-apk.yml', 'utf8');
const staging = fs.readFileSync('.github/workflows/staging-v2-smoke.yml', 'utf8');
const trusted = fs.readFileSync('.github/workflows/v2-trusted-maintenance.yml', 'utf8');
const quality = fs.readFileSync('.github/workflows/quality.yml', 'utf8');
const firestore = fs.readFileSync('.github/workflows/firestore-v2-security.yml', 'utf8');

assert.match(android, /workflow_dispatch:/);
assert.doesNotMatch(android, /\n\s+push:/);
assert.doesNotMatch(android, /\n\s+pull_request:/);
assert.match(android, /retention-days: 90/);
assert.match(android, /gh release create/);

assert.match(staging, /workflow_dispatch:/);
assert.doesNotMatch(staging, /\n\s+pull_request:/);
assert.doesNotMatch(staging, /\n\s+push:/);

assert.match(trusted, /cron: "17 \*\/6 \* \* \*"/);
assert.doesNotMatch(trusted, /\n\s+pull_request:/);

assert.match(quality, /pull_request:/);
assert.match(quality, /paths-ignore:/);
assert.match(quality, /docs\/\*\*/);
assert.doesNotMatch(quality, /Firestore V2 emulator security/);

assert.match(firestore, /pull_request:/);
assert.match(firestore, /firebase\/\*\*/);
assert.match(firestore, /tests\/firestore\.v2\*\.mjs/);
assert.match(firestore, /Firestore V2 emulator security/);

console.log('PASS Android and real staging are manual-only');
console.log('PASS trusted maintenance is capped at four scheduled runs/day');
console.log('PASS docs-only PR updates do not consume quality minutes');
console.log('PASS Firestore emulator runs only for relevant security changes or manual dispatch');
console.log('GitHub Actions budget policy: PASS');
