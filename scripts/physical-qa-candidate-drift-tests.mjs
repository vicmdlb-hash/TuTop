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

// APK28 is the certified 0.9.0 candidate and remains valid historical evidence.
assert.equal(candidate.app_version, '0.9.0-beta.0');
assert.equal(candidate.physical_release_candidate, true);
assert.equal(candidate.candidate_status, 'active_exact_head');
assert.equal(candidate.replacement_required, false);
assert.equal(candidate.artifact_id, 10292454237);
assert.equal(candidate.build_run_id, 34677397609);
assert.equal(candidate.gate_run_id, 34677058300);
assert.equal(candidate.staging_smoke_run_id, 34677242862);
assert.equal(candidate.apk_sha256, '2131007fb944b144d85eb8c5deb9ad80f93bd20c1515b7793f89278cd1a9f7e3');
assert.equal(candidateExactHeadIdentityValid(candidate), true);

const historicalExactRefs = evaluateCandidateRuntimeDrift(candidate, (repoPath) => refs[repoPath]);
assert.equal(historicalExactRefs.fresh, true);
assert.equal(historicalExactRefs.runtime_refs_fresh, true);
assert.equal(historicalExactRefs.identity_valid, true);
assert.equal(historicalExactRefs.mismatches.length, 0);
assert.deepEqual(evaluatePrebuildCandidateState(candidate, historicalExactRefs, '0.9.0-beta.0'), {
  pass: true,
  reason: 'current_candidate_still_fresh',
});

// 0.9.1 intentionally changes runtime. That must not mutate or invalidate the
// certified 0.9.0 manifest; it may only allow a NEW version namespace candidate.
const srcChanged = evaluateCandidateRuntimeDrift(candidate, (repoPath) => repoPath === 'src'
  ? '0000000000000000000000000000000000000000'
  : refs[repoPath]);
assert.equal(srcChanged.fresh, false);
assert.equal(srcChanged.runtime_refs_fresh, false);
assert.equal(srcChanged.mismatches.length, 1);
assert.equal(srcChanged.mismatches[0].path, 'src');
assert.deepEqual(evaluatePrebuildCandidateState(candidate, srcChanged, '0.9.1-beta.0'), {
  pass: true,
  reason: 'prior_version_candidate_preserved',
});

// A stale candidate from the SAME version cannot escape through version-aware logic.
assert.equal(evaluatePrebuildCandidateState(candidate, srcChanged, '0.9.0-beta.1').pass, false);
assert.equal(evaluatePrebuildCandidateState(candidate, srcChanged, '0.8.9-beta.0').pass, false);
assert.equal(evaluatePrebuildCandidateState(candidate, srcChanged, 'not-semver').pass, false);

assert.equal(compareVersionCore('0.9.1-beta.0', '0.9.0-beta.0'), 1);
assert.equal(compareVersionCore('0.9.0-beta.1', '0.9.0-beta.0'), 0, 'pre-release suffix never creates a new runtime namespace');
assert.equal(compareVersionCore('0.8.9', '0.9.0-beta.0'), -1);
assert.equal(compareVersionCore('bad', '0.9.0'), null);

const inconsistent = { ...candidate, candidate_status: 'obsolete_runtime_drift', replacement_required: true };
const inconsistentDrift = evaluateCandidateRuntimeDrift(inconsistent, (repoPath) => refs[repoPath]);
assert.equal(evaluatePrebuildCandidateState(inconsistent, inconsistentDrift, '0.9.1-beta.0').pass, false);

const invalidIdentity = { ...candidate, staging_smoke_commit_sha: '0'.repeat(40) };
const invalidIdentityDrift = evaluateCandidateRuntimeDrift(invalidIdentity, (repoPath) => refs[repoPath]);
assert.equal(invalidIdentityDrift.identity_valid, false);
assert.equal(evaluatePrebuildCandidateState(invalidIdentity, invalidIdentityDrift, '0.9.1-beta.0').pass, false,
  'a malformed old candidate may not authorize a new namespace build');

const obsolete = {
  ...candidate,
  physical_release_candidate: false,
  candidate_status: 'obsolete_runtime_drift',
  replacement_required: true,
};
const obsoleteDrift = evaluateCandidateRuntimeDrift(obsolete, (repoPath) => repoPath === 'src'
  ? '0'.repeat(40)
  : refs[repoPath]);
assert.deepEqual(evaluatePrebuildCandidateState(obsolete, obsoleteDrift, '0.9.0-beta.0'), {
  pass: true,
  reason: 'obsolete_candidate_acknowledged_replacement_required',
});

const missingPackage = evaluateCandidateRuntimeDrift(candidate, (repoPath) => {
  if (repoPath === 'package-lock.json') throw new Error('missing');
  return refs[repoPath];
});
assert.equal(missingPackage.fresh, false);
assert.equal(missingPackage.runtime_refs_fresh, false);
assert.equal(missingPackage.mismatches[0].path, 'package-lock.json');
assert.equal(missingPackage.mismatches[0].reason, 'missing_or_unresolvable');

console.log('PASS APK28 remains an active exact-head 0.9.0 historical candidate');
console.log('PASS strictly newer 0.9.1 namespace may build without rewriting or degrading APK28 evidence');
console.log('PASS same-version drift, downgrade, malformed semver and invalid exact-head identity fail closed');
console.log('PASS explicit obsolete-runtime replacement behavior remains supported inside one version namespace');
console.log('Physical QA candidate drift/prebuild contract: PASS');
