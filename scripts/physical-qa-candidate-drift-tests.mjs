import assert from 'node:assert/strict';
import { loadPhysicalQaCandidateManifest, evaluateCandidateRuntimeDrift } from './physical-qa-candidate-drift.mjs';

const candidate = loadPhysicalQaCandidateManifest();
const refs = candidate.client_runtime_refs;

const clean = evaluateCandidateRuntimeDrift(candidate, (repoPath) => refs[repoPath]);
assert.equal(clean.fresh, true);
assert.equal(clean.mismatches.length, 0);
assert.equal(clean.artifact_id, 10002986519);

const srcChanged = evaluateCandidateRuntimeDrift(candidate, (repoPath) => repoPath === 'src'
  ? '0000000000000000000000000000000000000000'
  : refs[repoPath]);
assert.equal(srcChanged.fresh, false);
assert.equal(srcChanged.mismatches.length, 1);
assert.equal(srcChanged.mismatches[0].path, 'src');
assert.equal(srcChanged.mismatches[0].reason, 'changed');

const missingPackage = evaluateCandidateRuntimeDrift(candidate, (repoPath) => {
  if (repoPath === 'package-lock.json') throw new Error('missing');
  return refs[repoPath];
});
assert.equal(missingPackage.fresh, false);
assert.equal(missingPackage.mismatches[0].path, 'package-lock.json');
assert.equal(missingPackage.mismatches[0].reason, 'missing_or_unresolvable');

console.log('PASS current candidate reference set can remain fresh');
console.log('PASS any packaged runtime input drift invalidates the physical candidate');
console.log('PASS missing runtime input fails closed');
console.log('Physical QA candidate drift contract: PASS');
