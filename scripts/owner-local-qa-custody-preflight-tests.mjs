import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { probeOwnerQaCustody } from './owner-local-qa-custody-preflight.mjs';

const root = String.raw`C:\Users\Synthetic`;
const expectedNames = [
  'TuTop-QA-ONLY-20261116.p12',
  'TuTop-age-identity-OWNER-ONLY-20261116.txt',
  'RECOVERY_SECRET_LOCAL_ONLY_20261116.txt',
];
const queries = [];
const presentFile = (size = 3000) => ({
  isFile: () => true,
  isSymbolicLink: () => false,
  size,
});
const fakeStat = (f) => {
  queries.push(f);
  const name = path.win32.basename(f);
  assert(expectedNames.includes(name), 'only three fixed files may be probed');
  return presentFile();
};
const good = probeOwnerQaCustody({platform:'win32',userProfile:root,stat:fakeStat});
assert.equal(good.schema,'tutop.owner-qa-custody-preflight.v1');
assert.equal(good.operation,'LOCAL_READ_ONLY_FILE_PRESENCE');
assert.equal(good.platform_supported,true);
assert.equal(good.qa_p12_present,true);
assert.equal(good.age_identity_present,true);
assert.equal(good.recovery_secret_present,true);
assert.equal(good.signing_material_presence_only,true);
assert.equal(good.recovery_material_presence_only,true);
assert.equal(good.current_apk_proven,false);
assert.equal(good.physical_r6_proven,false);
assert.equal(good.permission_to_sign_or_restore,false);
assert.equal(queries.length,3);
assert.deepEqual(queries.map(x => path.win32.basename(x)),expectedNames);
assert(!JSON.stringify(good).includes(root), 'private path must never be output');

for (const [name, changed] of [
  ['p12',{isFile:()=>false,isSymbolicLink:()=>false,size:2000}],
  ['identity',{isFile:()=>true,isSymbolicLink:()=>true,size:2000}],
  ['recovery',{isFile:()=>true,isSymbolicLink:()=>false,size:0}],
]) {
  const field = name==='p12' ? 'qa_p12_present' : name==='identity' ? 'age_identity_present' : 'recovery_secret_present';
  const key = name==='p12' ? expectedNames[0] : name==='identity' ? expectedNames[1] : expectedNames[2];
  const res = probeOwnerQaCustody({
    platform:'win32',userProfile:root,
    stat:(f)=>path.win32.basename(f)===key?changed:presentFile(),
  });
  assert.equal(res[field],false);
  assert.equal(res.current_apk_proven,false);
}
const notInstalled = probeOwnerQaCustody({
  platform:'win32',userProfile:root,stat:()=>{throw new Error('secret-path or username must stay private');},
});
assert.equal(notInstalled.qa_p12_present,false);
assert.equal(notInstalled.age_identity_present,false);
assert.equal(notInstalled.recovery_secret_present,false);
assert(!JSON.stringify(notInstalled).includes('secret-path'));
const nonWindows = probeOwnerQaCustody({platform:'linux',userProfile:root,stat:()=>{throw new Error('must not stat');}});
assert.equal(nonWindows.platform_supported,false);
assert.equal(nonWindows.qa_p12_present,false);
const noHome = probeOwnerQaCustody({platform:'win32',userProfile:'',stat:()=>{throw new Error('must not stat');}});
assert.equal(noHome.platform_supported,true);
assert.equal(noHome.qa_p12_present,false);

const source=fs.readFileSync('scripts/owner-local-qa-custody-preflight.mjs','utf8');
assert.doesNotMatch(source, /fs\.readFileSync|fs\.writeFileSync|fetch\s*\(|unlinkSync|rmSync|copyFileSync|process\.env\.TUTOP_QA_JKS_PASSWORD/);
assert.match(source,/LOCAL_READ_ONLY_FILE_PRESENCE/);
assert.match(source,/permission_to_sign_or_restore: false/);
console.log('PASS owner-local QA custody preflight checks exactly three file presences; no private bytes, no APK or release claims');
