import assert from 'node:assert/strict';
import {
  loadPhysicalQaCandidateManifest,
  candidateExactHeadIdentityValid,
  evaluateCandidateRuntimeDrift,
  evaluatePrebuildCandidateState,
} from './physical-qa-candidate-drift.mjs';

const candidate = loadPhysicalQaCandidateManifest();
const refs = candidate.client_runtime_refs;

assert.equal(candidate.physical_release_candidate, false);
assert.equal(candidate.candidate_status, 'obsolete_runtime_drift');
assert.equal(candidate.replacement_required, true);
assert.equal(candidateExactHeadIdentityValid(candidate), false, 'historical obsolete manifest predates triple-SHA identity');

const historicalRefs = evaluateCandidateRuntimeDrift(candidate, (repoPath) => refs[repoPath]);
assert.equal(historicalRefs.fresh, true, 'inactive historical candidate may still have fresh historical refs');
assert.equal(historicalRefs.runtime_refs_fresh, true);
assert.equal(historicalRefs.identity_valid, false);
assert.equal(historicalRefs.mismatches.length, 0);
assert.equal(historicalRefs.artifact_id, 10002986519);

const srcChanged = evaluateCandidateRuntimeDrift(candidate, (repoPath) => repoPath === 'src'
  ? '0000000000000000000000000000000000000000'
  : refs[repoPath]);
assert.equal(srcChanged.fresh, false);
assert.equal(srcChanged.runtime_refs_fresh, false);
assert.equal(srcChanged.mismatches.length, 1);
assert.equal(srcChanged.mismatches[0].path, 'src');
assert.equal(srcChanged.mismatches[0].reason, 'changed');
assert.deepEqual(evaluatePrebuildCandidateState(candidate, srcChanged), {
  pass: true,
  reason: 'obsolete_candidate_acknowledged_replacement_required',
});

const inconsistent = { ...candidate, physical_release_candidate: true, candidate_status: 'obsolete_runtime_drift', replacement_required: true };
const inconsistentDrift = evaluateCandidateRuntimeDrift(inconsistent, (repoPath) => refs[repoPath]);
assert.equal(inconsistentDrift.fresh, false, 'active candidate without triple-SHA identity must fail closed');
assert.equal(evaluatePrebuildCandidateState(inconsistent, inconsistentDrift).pass, false);

const exactSha = String(candidate.build_commit_sha || '1'.repeat(40));
const freshActiveCandidate = {
  ...candidate,
  physical_release_candidate: true,
  candidate_status: 'active_exact_head',
  replacement_required: false,
  build_commit_sha: exactSha,
  gate_commit_sha: exactSha,
  staging_smoke_commit_sha: exactSha,
  gate_run_id: 101,
  staging_smoke_run_id: 102,
  build_run_id: 103,
  artifact_id: 104,
};
assert.equal(candidateExactHeadIdentityValid(freshActiveCandidate), true);
const cleanActive = evaluateCandidateRuntimeDrift(freshActiveCandidate, (repoPath) => refs[repoPath]);
assert.equal(cleanActive.identity_valid, true);
assert.deepEqual(evaluatePrebuildCandidateState(freshActiveCandidate, cleanActive), {
  pass: true,
  reason: 'current_candidate_still_fresh',
});

for (const mutate of [
  (x) => { x.gate_commit_sha = '0'.repeat(40); },
  (x) => { x.staging_smoke_commit_sha = '0'.repeat(40); },
  (x) => { x.gate_run_id = 0; },
  (x) => { x.staging_smoke_run_id = 0; },
  (x) => { x.build_run_id = 0; },
  (x) => { x.artifact_id = 0; },
]) {
  const broken = structuredClone(freshActiveCandidate);
  mutate(broken);
  assert.equal(candidateExactHeadIdentityValid(broken), false);
  const brokenDrift = evaluateCandidateRuntimeDrift(broken, (repoPath) => refs[repoPath]);
  assert.equal(brokenDrift.fresh, false);
  assert.equal(evaluatePrebuildCandidateState(broken, brokenDrift).pass, false);
}

const wrongStatus = { ...freshActiveCandidate, candidate_status: 'active' };
assert.equal(evaluatePrebuildCandidateState(wrongStatus, evaluateCandidateRuntimeDrift(wrongStatus, (repoPath) => refs[repoPath])).pass, false);

const missingPackage = evaluateCandidateRuntimeDrift(candidate, (repoPath) => {
  if (repoPath === 'package-lock.json') throw new Error('missing');
  return refs[repoPath];
});
assert.equal(missingPackage.fresh, false);
assert.equal(missingPackage.runtime_refs_fresh, false);
assert.equal(missingPackage.mismatches[0].path, 'package-lock.json');
assert.equal(missingPackage.mismatches[0].reason, 'missing_or_unresolvable');

console.log('PASS historical APK is explicitly obsolete and cannot be a current release candidate');
console.log('PASS prebuild allows replacement only when obsolete runtime drift is acknowledged fail-closed');
console.log('PASS active candidates require exact gate SHA = staging SHA = build SHA plus valid run/artifact IDs');
console.log('PASS malformed active status or identity cannot be reused even with unchanged runtime refs');
console.log('PASS a genuinely fresh active_exact_head candidate remains reusable');
console.log('Physical QA candidate drift/prebuild contract: PASS');
