import assert from 'node:assert/strict';
import {
  loadPhysicalQaCandidateManifest,
  evaluateCandidateRuntimeDrift,
  evaluatePrebuildCandidateState,
} from './physical-qa-candidate-drift.mjs';

const candidate = loadPhysicalQaCandidateManifest();
const refs = candidate.client_runtime_refs;

assert.equal(candidate.physical_release_candidate, false);
assert.equal(candidate.candidate_status, 'obsolete_runtime_drift');
assert.equal(candidate.replacement_required, true);

const historicalRefs = evaluateCandidateRuntimeDrift(candidate, (repoPath) => refs[repoPath]);
assert.equal(historicalRefs.fresh, true);
assert.equal(historicalRefs.mismatches.length, 0);
assert.equal(historicalRefs.artifact_id, 10002986519);

const srcChanged = evaluateCandidateRuntimeDrift(candidate, (repoPath) => repoPath === 'src'
  ? '0000000000000000000000000000000000000000'
  : refs[repoPath]);
assert.equal(srcChanged.fresh, false);
assert.equal(srcChanged.mismatches.length, 1);
assert.equal(srcChanged.mismatches[0].path, 'src');
assert.equal(srcChanged.mismatches[0].reason, 'changed');
assert.deepEqual(evaluatePrebuildCandidateState(candidate, srcChanged), {
  pass: true,
  reason: 'obsolete_candidate_acknowledged_replacement_required',
});

const inconsistent = { ...candidate, physical_release_candidate: true, candidate_status: 'obsolete_runtime_drift', replacement_required: true };
assert.equal(evaluatePrebuildCandidateState(inconsistent, srcChanged).pass, false);

const freshActiveCandidate = { ...candidate, physical_release_candidate: true, candidate_status: 'active', replacement_required: false };
const cleanActive = evaluateCandidateRuntimeDrift(freshActiveCandidate, (repoPath) => refs[repoPath]);
assert.deepEqual(evaluatePrebuildCandidateState(freshActiveCandidate, cleanActive), {
  pass: true,
  reason: 'current_candidate_still_fresh',
});

const missingPackage = evaluateCandidateRuntimeDrift(candidate, (repoPath) => {
  if (repoPath === 'package-lock.json') throw new Error('missing');
  return refs[repoPath];
});
assert.equal(missingPackage.fresh, false);
assert.equal(missingPackage.mismatches[0].path, 'package-lock.json');
assert.equal(missingPackage.mismatches[0].reason, 'missing_or_unresolvable');

console.log('PASS historical APK is explicitly obsolete and cannot be a current release candidate');
console.log('PASS prebuild allows replacement only when obsolete runtime drift is acknowledged fail-closed');
console.log('PASS inconsistent stale candidate state still blocks prebuild');
console.log('PASS a genuinely fresh active candidate remains reusable');
console.log('Physical QA candidate drift/prebuild contract: PASS');
