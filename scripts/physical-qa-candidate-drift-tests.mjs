import assert from 'node:assert/strict';
import {
  loadPhysicalQaCandidateManifest,
  candidateExactHeadIdentityValid,
  compareVersionCore,
  evaluateCandidateRuntimeDrift,
  evaluatePrebuildCandidateState,
} from './physical-qa-candidate-drift.mjs';

const candidate = loadPhysicalQaCandidateManifest();
const refs = candidate.client_runtime_refs;

assert.match(String(candidate.app_version || ''), /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
assert.equal(candidate.app_version, '0.9.2-beta.11');
assert.equal(candidate.physical_release_candidate, true);
assert.equal(candidate.candidate_status, 'active_exact_head');
assert.equal(candidate.replacement_required, false);
assert.equal(candidate.build_commit_sha, '579bdecd7e193b8661276f114b9d3e097792d8d6');
assert.equal(candidate.build_run_id, 36064382977);
assert.equal(candidate.artifact_id, 10835643904);
assert.equal(candidate.application_id, 'mx.tutop.app');
assert.equal(candidate.apk_sha256, 'acd939e5aa4d078270b2fb485e9a41741638e4501cd3c3167871c9ca7bc6f6b8');
assert.match(String(candidate.apk_cert_sha256 || ''), /^[A-F0-9]{64}$/);
assert.equal(candidateExactHeadIdentityValid(candidate), true);

const [major, minor, patch] = String(candidate.app_version).match(/^(\d+)\.(\d+)\.(\d+)/).slice(1).map(Number);
const sameCoreNextPrerelease = major+'.'+minor+'.'+patch+'-beta.99';
const nextNamespace = major+'.'+(minor+1)+'.0-beta.0';
const previousNamespace = major+'.'+Math.max(0,minor-1)+'.0-beta.0';

const exactRefs = evaluateCandidateRuntimeDrift(candidate, (repoPath) => refs[repoPath]);
assert.equal(exactRefs.fresh, true);
assert.equal(exactRefs.runtime_refs_fresh, true);
assert.equal(exactRefs.identity_valid, true);
assert.equal(exactRefs.mismatches.length, 0);
assert.deepEqual(evaluatePrebuildCandidateState(candidate, exactRefs, candidate.app_version), {
  pass: true,
  reason: 'current_candidate_still_fresh',
});
assert.deepEqual(evaluatePrebuildCandidateState(candidate, exactRefs, sameCoreNextPrerelease), {
  pass: true,
  reason: 'current_candidate_still_fresh',
});
assert.deepEqual(evaluatePrebuildCandidateState(candidate, exactRefs, nextNamespace), {
  pass: true,
  reason: 'prior_version_candidate_preserved',
});

const srcChanged = evaluateCandidateRuntimeDrift(candidate, (repoPath) => repoPath === 'src'
  ? '0000000000000000000000000000000000000000'
  : refs[repoPath]);
assert.equal(srcChanged.runtime_refs_fresh, false);
assert.equal(srcChanged.identity_valid, true);
assert.equal(evaluatePrebuildCandidateState(candidate, srcChanged, sameCoreNextPrerelease).pass, false);

const invalidIdentity = { ...candidate, staging_smoke_commit_sha: '0'.repeat(40) };
const invalidIdentityDrift = evaluateCandidateRuntimeDrift(invalidIdentity, (repoPath) => refs[repoPath]);
assert.equal(invalidIdentityDrift.identity_valid, false);
assert.equal(evaluatePrebuildCandidateState(invalidIdentity, invalidIdentityDrift, sameCoreNextPrerelease).pass, false);

const obsoleteRuntime = {
  ...candidate,
  physical_release_candidate: false,
  candidate_status: 'obsolete_runtime_drift',
  replacement_required: true,
};
const obsoleteRuntimeDrift = evaluateCandidateRuntimeDrift(obsoleteRuntime, (repoPath) => repoPath === 'src'
  ? '0'.repeat(40)
  : refs[repoPath]);
assert.deepEqual(evaluatePrebuildCandidateState(obsoleteRuntime, obsoleteRuntimeDrift, sameCoreNextPrerelease), {
  pass: true,
  reason: 'obsolete_candidate_acknowledged_replacement_required',
});

const obsoletePhysical = {
  ...candidate,
  physical_release_candidate: false,
  candidate_status: 'obsolete_physical_fail',
  replacement_required: true,
};
const obsoletePhysicalDrift = evaluateCandidateRuntimeDrift(obsoletePhysical, (repoPath) => refs[repoPath]);
assert.deepEqual(evaluatePrebuildCandidateState(obsoletePhysical, obsoletePhysicalDrift, sameCoreNextPrerelease), {
  pass: true,
  reason: 'physical_fail_candidate_acknowledged_replacement_required',
});

assert.equal(compareVersionCore(nextNamespace, candidate.app_version), 1);
assert.equal(compareVersionCore(sameCoreNextPrerelease, candidate.app_version), 0);
assert.equal(compareVersionCore(previousNamespace, candidate.app_version), -1);
assert.equal(compareVersionCore('bad', candidate.app_version), null);

console.log('PASS Build121 is the active exact-head Physical QA candidate and Build120 is no longer reusable');
console.log('PASS active candidate runtime refs and build/gate/staging identity are exact and fail closed on drift');
console.log('PASS prior-version and obsolete replacement semantics remain supported without synthesizing physical PASS');
console.log('Physical QA candidate drift/prebuild contract: PASS');
