import assert from 'node:assert/strict';
import { loadPhysicalQaCandidateManifest, verifyCurrentCandidateRuntime } from './physical-qa-candidate-drift.mjs';

const previous=loadPhysicalQaCandidateManifest();
const drift=verifyCurrentCandidateRuntime();

assert.equal(previous.app_version,'0.9.2-beta.7');
assert.equal(previous.build_commit_sha,'a578a214f17f3a0ddb7c0d8c6039866f0252c015');
assert.equal(previous.artifact_id,10600229165);
assert.equal(previous.physical_release_candidate,true);
assert.equal(drift.runtime_refs_fresh,false);
assert(drift.mismatches.some((x)=>x.path==='src'&&x.reason==='changed'));
assert.equal(drift.identity_valid,true);

console.log('PASS Build117 physical candidate identity is preserved as historical authority');
console.log('PASS Build118 runtime change invalidates Build117 physical reuse');
console.log('PASS replacement physical binding is required only after exact Build118 artifact exists');
