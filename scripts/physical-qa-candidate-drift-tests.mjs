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
assert.equal(candidate.physical_release_candidate, false);
assert.equal(candidate.candidate_status, 'obsolete_physical_fail');
assert.equal(candidate.replacement_required, true);
assert(Number.isSafeInteger(candidate.artifact_id) && candidate.artifact_id > 0);
assert.match(String(candidate.apk_sha256 || ''), /^[a-f0-9]{64}$/);
assert.equal(candidateExactHeadIdentityValid(candidate), true);

const [major, minor, patch] = String(candidate.app_version).match(/^(\d+)\.(\d+)\.(\d+)/).slice(1).map(Number);
const sameCoreNextPrerelease = major+'.'+minor+'.'+patch+'-beta.99';
const nextNamespace = major+'.'+(minor+1)+'.0-beta.0';
const previousNamespace = major+'.'+Math.max(0,minor-1)+'.0-beta.0';

const historicalExactRefs = evaluateCandidateRuntimeDrift(candidate, (repoPath) => refs[repoPath]);
assert.equal(historicalExactRefs.fresh, true);
assert.equal(historicalExactRefs.runtime_refs_fresh, true);
assert.equal(historicalExactRefs.identity_valid, true);
assert.equal(historicalExactRefs.mismatches.length, 0);
assert.deepEqual(evaluatePrebuildCandidateState(candidate, historicalExactRefs, candidate.app_version), {
  pass: true,
  reason: 'physical_fail_candidate_acknowledged_replacement_required',
});
assert.deepEqual(evaluatePrebuildCandidateState(candidate, historicalExactRefs, sameCoreNextPrerelease), {
  pass: true,
  reason: 'physical_fail_candidate_acknowledged_replacement_required',
});
assert.deepEqual(evaluatePrebuildCandidateState(candidate, historicalExactRefs, nextNamespace), {
  pass: true,
  reason: 'physical_fail_candidate_acknowledged_replacement_required',
});

const srcChanged = evaluateCandidateRuntimeDrift(candidate, (repoPath) => repoPath === 'src'
  ? '0000000000000000000000000000000000000000'
  : refs[repoPath]);
assert.equal(srcChanged.runtime_refs_fresh, false);
assert.equal(srcChanged.identity_valid, true);
assert.deepEqual(evaluatePrebuildCandidateState(candidate, srcChanged, sameCoreNextPrerelease), {
  pass: true,
  reason: 'physical_fail_candidate_acknowledged_replacement_required',
});

const invalidIdentity = { ...candidate, staging_smoke_commit_sha: '0'.repeat(40) };
const invalidIdentityDrift = evaluateCandidateRuntimeDrift(invalidIdentity, (repoPath) => refs[repoPath]);
assert.equal(invalidIdentityDrift.identity_valid, false);
assert.equal(evaluatePrebuildCandidateState(invalidIdentity, invalidIdentityDrift, sameCoreNextPrerelease).pass, false);

const obsoleteRuntime = {
  ...candidate,
  candidate_status: 'obsolete_runtime_drift',
};
const obsoleteRuntimeDrift = evaluateCandidateRuntimeDrift(obsoleteRuntime, (repoPath) => repoPath === 'src'
  ? '0'.repeat(40)
  : refs[repoPath]);
assert.deepEqual(evaluatePrebuildCandidateState(obsoleteRuntime, obsoleteRuntimeDrift, sameCoreNextPrerelease), {
  pass: true,
  reason: 'obsolete_candidate_acknowledged_replacement_required',
});

assert.equal(compareVersionCore(nextNamespace, candidate.app_version), 1);
assert.equal(compareVersionCore(sameCoreNextPrerelease, candidate.app_version), 0);
assert.equal(compareVersionCore(previousNamespace, candidate.app_version), -1);
assert.equal(compareVersionCore('bad', candidate.app_version), null);

console.log('PASS Build120 repository candidate is historical obsolete_physical_fail and cannot be reused');
console.log('PASS a valid physically failed candidate authorizes replacement without pretending runtime drift');
console.log('PASS malformed historical identity cannot authorize a replacement build');
console.log('PASS obsolete runtime-drift semantics remain separately supported');
console.log('Physical QA candidate drift/prebuild contract: PASS');
