import assert from 'node:assert/strict';
import fs from 'node:fs';
const backend=fs.readFileSync('src/services/onlineBackend.ts','utf8');
const helper=fs.readFileSync('src/lib/reportRateBudget.ts','utf8');
assert.match(backend,/nextReportRateBucket\(uid, at, previous\?\.data \|\| null\)/);
assert.match(backend,/await client\.commit\(\[/);
assert.match(backend,/previous \? \{ updateTime: previous\.updateTime \} : \{ exists: false \}/);
assert.match(helper,/window_start:new Date\(/);
console.log('PASS V2 report atomic source contract');

import { spawnSync } from 'node:child_process';
// Exercise the real TypeScript helper on Node 22, not only string matching.
// Lower 10/20 caps remain enforced by Firestore rules, not claimed here.
const runtime = String.raw`
import assert from 'node:assert/strict';
import { nextReportRateBucket } from './src/lib/reportRateBudget.ts';
const at = '2026-10-28T20:30:00.000Z';
const earlier = '2026-10-28T20:00:00.000Z';
const bucket = (count, window_start = earlier) => ({
 uid:'test-user', action:'report_create', count, window_start, updated_at:earlier,
});
assert.equal(nextReportRateBucket('test-user', at, null).count, 1);
assert.equal(nextReportRateBucket('test-user', at, bucket(39)).count, 40);
assert.throws(()=>nextReportRateBucket('test-user', at, bucket(40)),
  {message:'REPORT_RATE_MAX_REACHED'});
assert.throws(()=>nextReportRateBucket('test-user', at, bucket(41)),
  {message:'REPORT_RATE_BUCKET_INVALID'});
const reset = nextReportRateBucket('test-user', at,
  bucket(40,'2026-10-28T19:00:00.000Z'));
assert.equal(reset.count,1);
assert.equal(reset.window_start.toISOString(),at);
assert.throws(()=>nextReportRateBucket('other-user', at, bucket(1)),
  {message:'REPORT_RATE_BUCKET_INVALID'});
`;
const check = spawnSync(process.execPath,
  ['--experimental-strip-types', '--input-type=module', '-e', runtime],
  { encoding:'utf8', maxBuffer:1_000_000 });
assert.equal(check.status, 0,
  'Report budget runtime regression failed: ' + (check.stderr || check.stdout));
console.log('PASS report rate 40-max local guard, hourly reset, and owner isolation');
