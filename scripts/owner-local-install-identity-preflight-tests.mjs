import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { assessOwnerLocalInstallMetadata as assess } from './owner-local-install-identity-preflight.mjs';

const fingerprint='a'.repeat(64);
const other='b'.repeat(64);
const complete = {
  candidatePackage: 'mx.tutop.app',
  candidateVersionCode: '90216',
  candidateCertSha256: fingerprint,
  installedState: 'present',
  installedPackage: 'mx.tutop.app',
  installedVersionCode: '90215',
  installedCertSha256: fingerprint,
};
function blocked(changes, expected) {
  const r=assess({ ...complete, ...changes });
  assert.equal(r.reason, expected);
  assert.equal(r.comparison_passed, false);
  assert.equal(r.permission_to_install, false);
  assert.equal(r.candidate_apk_verified, false);
  assert.equal(r.device_inventory_verified, false);
  assert.equal(r.physical_r6_passed, false);
  assert.equal(r.release_allowed, false);
  assert.equal(Object.keys(r).some(k => /sha256|password|path|device_id|token/i.test(k)),false);
}
const good=assess(complete);
assert.equal(good.comparison_passed,true);
assert.equal(good.permission_to_install,false);
assert.equal(good.candidate_apk_verified,false);
assert.equal(good.device_inventory_verified,false);
assert.equal(good.release_allowed,false);
assert.match(good.reason,/CLAIM_ONLY/);

// Historical Build121 90215 cannot normally be updated by the 90200 plan.
blocked({candidateVersionCode:'90200'},'DOWNGRADE_BLOCKED');
blocked({candidateVersionCode:90215},'SAME_CODE_REQUIRES_SEPARATE_QA_REVIEW');
blocked({candidateVersionCode:'90214'},'DOWNGRADE_BLOCKED');
blocked({candidateVersionCode:'90216',candidateCertSha256:other},'SIGNER_MISMATCH_OR_ROTATION_UNVERIFIED');
blocked({candidateCertSha256:'unknown'},'CERTIFICATE_METADATA_UNKNOWN_OR_INVALID');
blocked({installedCertSha256:null},'CERTIFICATE_METADATA_UNKNOWN_OR_INVALID');
blocked({installedState:'unknown'},'INSTALLED_STATE_UNKNOWN');
blocked({installedState:'absent'},'NO_INSTALLED_COMPARISON_PHYSICAL_ABSENCE_UNVERIFIED');
blocked({installedState:''},'INSTALLED_STATE_UNKNOWN');
blocked({installedPackage:'another.app'},'INSTALLED_PACKAGE_UNKNOWN_OR_MISMATCH');
blocked({candidatePackage:'another.app'},'CANDIDATE_PACKAGE_UNKNOWN_OR_INVALID');
blocked({candidateVersionCode:'garbage'},'CANDIDATE_VERSION_CODE_UNKNOWN_OR_INVALID');
blocked({installedVersionCode:''},'INSTALLED_VERSION_CODE_UNKNOWN_OR_INVALID');
blocked({installedVersionCode:0},'INSTALLED_VERSION_CODE_UNKNOWN_OR_INVALID');
blocked({candidateVersionCode:0},'CANDIDATE_VERSION_CODE_UNKNOWN_OR_INVALID');
blocked({candidateVersionCode:'90216.1'},'CANDIDATE_VERSION_CODE_UNKNOWN_OR_INVALID');
blocked({candidateVersionCode:Infinity},'CANDIDATE_VERSION_CODE_UNKNOWN_OR_INVALID');
assert.equal(assess({...complete,candidateCertSha256:fingerprint.toUpperCase()}).comparison_passed,true);
assert.equal(assess({...complete,candidateCertSha256:fingerprint.match(/.{2}/g).join(':')}).comparison_passed,true);
assert.equal(assess(null).reason,'INPUT_INVALID');
const src=fs.readFileSync('scripts/owner-local-install-identity-preflight.mjs','utf8');
assert.doesNotMatch(src,/from ['"]node:(?:fs|child_process|net|http|https)['"]/);
assert.doesNotMatch(src,/execFile|spawnSync|\badb\s+install\b|firebase:deploy|unlinkSync|rmSync/);
const invocation=spawnSync(process.execPath,['scripts/owner-local-install-identity-preflight.mjs'],{
  encoding:'utf8',env:{PATH:process.env.PATH||''},timeout:15000,
});
assert.equal(invocation.status,0);
assert.equal(invocation.stderr,'');
const fallback=JSON.parse(invocation.stdout);
assert.equal(fallback.comparison_passed,false);
assert.equal(fallback.reason,'CANDIDATE_PACKAGE_UNKNOWN_OR_INVALID');
assert.equal(fallback.permission_to_install,false);
console.log('PASS owner-declared Android identity preflight: downgrade/equal-code/mismatched-cert/unknown blocked; no ADB, APK, secret reads or install');
