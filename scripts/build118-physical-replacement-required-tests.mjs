import assert from 'node:assert/strict';
import { loadPhysicalQaCandidateManifest, verifyCurrentCandidateRuntime } from './physical-qa-candidate-drift.mjs';

const current=loadPhysicalQaCandidateManifest();
const drift=verifyCurrentCandidateRuntime();

assert.equal(current.app_version,'0.9.2-beta.8');
assert.equal(current.build_commit_sha,'e93ca0bb237e7fa438df5801fc627f065d9441e6');
assert.equal(current.artifact_id,10609901887);
assert.equal(current.physical_release_candidate,true);
assert.equal(current.candidate_status,'active_exact_head');
assert.equal(current.replacement_required,false);
assert.equal(drift.runtime_refs_fresh,true);
assert.equal(drift.identity_valid,true);

console.log('PASS Build118 replacement Physical QA binding is now active exact-runtime');
console.log('PASS Build117 physical authority is superseded for new sessions');
