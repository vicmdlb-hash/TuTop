import assert from 'node:assert/strict';
import fs from 'node:fs';
const backend=fs.readFileSync('src/services/onlineBackend.ts','utf8');
const helper=fs.readFileSync('src/lib/reportRateBudget.ts','utf8');
assert.match(backend,/nextReportRateBucket\(uid, at, previous\?\.data \|\| null\)/);
assert.match(backend,/await client\.commit\(\[/);
assert.match(backend,/previous \? \{ updateTime: previous\.updateTime \} : \{ exists: false \}/);
assert.match(helper,/window_start:new Date\(/);
console.log('PASS V2 report atomic source contract');
