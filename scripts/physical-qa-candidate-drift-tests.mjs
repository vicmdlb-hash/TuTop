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

// The repository manifest is the currently bound physical candidate. Tests must
// follow that candidate instead of pinning a historical 0.9.0 artifact forever.
assert.match(String(candidate.app_version || ''), /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
assert.equal(candidate.physical_release_candidate, true);
assert.equal(candidate.candidate_status, 'active_exact_head');
assert.equal(candidate.replacement_required, false);
assert(Number.isSafeInteger(candidate.artifact_id) && candidate.artifact_id > 0);
assert(Number.isSafeInteger(candidate.build_run_id) && candidate.build_run_id > 0);
assert(Number.isSafeInteger(candidate.gate_run_id) && candidate.gate_run_id > 0);
assert(Number.isSafeInteger(candidate.staging_smoke_run_id) && candidate.staging_smoke_run_id > 0);
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
  reason: 'current_candidate_still_fresh',
});

// A strictly newer semantic namespace may build while preserving this candidate
// as historical evidence; a same-core prerelease may not escape runtime drift.
const srcChanged = evaluateCandidateRuntimeDrift(candidate, (repoPath) => repoPath === 'src'
  ? '0000000000000000000000000000000000000000'
  : refs[repoPath]);
assert.equal(srcChanged.fresh, false);
assert.equal(srcChanged.runtime_refs_fresh, false);
assert.equal(srcChanged.mismatches.length, 1);
assert.equal(srcChanged.mismatches[0].path, 'src');
assert.deepEqual(evaluatePrebuildCandidateState(candidate, srcChanged, nextNamespace), {
  pass: true,
  reason: 'prior_version_candidate_preserved',
});

// A stale candidate from the SAME version core cannot escape through prerelease suffixes.
assert.equal(evaluatePrebuildCandidateState(candidate, srcChanged, sameCoreNextPrerelease).pass, false);
assert.equal(evaluatePrebuildCandidateState(candidate, srcChanged, previousNamespace).pass, false);
assert.equal(evaluatePrebuildCandidateState(candidate, srcChanged, 'not-semver').pass, false);

assert.equal(compareVersionCore(nextNamespace, candidate.app_version), 1);
assert.equal(compareVersionCore(sameCoreNextPrerelease, candidate.app_version), 0, 'pre-release suffix never creates a new runtime namespace');
assert.equal(compareVersionCore(previousNamespace, candidate.app_version), -1);
assert.equal(compareVersionCore('bad', candidate.app_version), null);

const inconsistent = { ...candidate, candidate_status: 'obsolete_runtime_drift', replacement_required: true };
const inconsistentDrift = evaluateCandidateRuntimeDrift(inconsistent, (repoPath) => refs[repoPath]);
assert.equal(evaluatePrebuildCandidateState(inconsistent, inconsistentDrift, nextNamespace).pass, false);

const invalidIdentity = { ...candidate, staging_smoke_commit_sha: '0'.repeat(40) };
const invalidIdentityDrift = evaluateCandidateRuntimeDrift(invalidIdentity, (repoPath) => refs[repoPath]);
assert.equal(invalidIdentityDrift.identity_valid, false);
assert.equal(evaluatePrebuildCandidateState(invalidIdentity, invalidIdentityDrift, nextNamespace).pass, false,
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
assert.deepEqual(evaluatePrebuildCandidateState(obsolete, obsoleteDrift, sameCoreNextPrerelease), {
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

console.log('PASS repository physical candidate remains active exact-head without historical version pinning');
console.log('PASS strictly newer semantic namespace may build without rewriting the prior candidate');
console.log('PASS same-version drift, downgrade, malformed semver and invalid exact-head identity fail closed');
console.log('PASS explicit obsolete-runtime replacement behavior remains supported inside one version namespace');
console.log('Physical QA candidate drift/prebuild contract: PASS');
