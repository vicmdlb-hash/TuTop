import fs from 'node:fs';
import assert from 'node:assert/strict';

const generator = fs.readFileSync('scripts/generate-physical-qa-candidate.mjs', 'utf8');
const verifier = fs.readFileSync('scripts/verify-generated-physical-qa-candidate.mjs', 'utf8');
const android = fs.readFileSync('.github/workflows/android-debug-apk.yml', 'utf8');
const canonical = JSON.parse(fs.readFileSync('docs/PHYSICAL_QA_CANDIDATE_0.9.json', 'utf8'));
const runbook = fs.readFileSync('docs/PHYSICAL_QA_EXECUTION_RUNBOOK_0.9.md', 'utf8');

assert.equal(canonical.physical_release_candidate, false);
assert.equal(canonical.candidate_status, 'obsolete_runtime_drift');
assert.equal(canonical.replacement_required, true);

assert.match(generator, /required\('GITHUB_SHA'\)/);
assert.match(generator, /required\('TUTOP_UPLOAD_ARTIFACT_ID'\)/);
assert.match(generator, /required\('GITHUB_RUN_ID'\)/);
assert.match(generator, /required\('TUTOP_VALIDATED_GATE_RUN_ID'\)/);
assert.match(generator, /required\('TUTOP_VALIDATED_STAGING_RUN_ID'\)/);
assert.match(generator, /git\('rev-parse', 'HEAD'\)/);
assert.match(generator, /git\('rev-parse', 'HEAD\^\{tree\}'\)/);
assert.match(generator, /client_runtime_refs: clientRuntimeRefs/);
assert.match(generator, /physical_release_candidate: true/);
assert.match(generator, /candidate_status: 'generated_exact_head_pending_repo_activation'/);
assert.match(generator, /replacement_required: false/);
assert.match(generator, /reviews_lazy: reviewsCutover/);
assert.match(generator, /wallet_lazy: walletCutover/);

assert.match(verifier, /candidate\.build_commit_sha !== head/);
assert.match(verifier, /candidate\.build_tree_sha !== tree/);
assert.match(verifier, /git\('rev-parse', `HEAD:\$\{repoPath\}`\)/);
assert.match(verifier, /candidate\.candidate_status !== 'generated_exact_head_pending_repo_activation'/);
assert.match(verifier, /candidate\.physical_release_candidate !== true/);

assert.match(android, /id: upload-staging/);
assert.match(android, /steps\.upload-staging\.outputs\.artifact-id/);
assert.match(android, /node scripts\/generate-physical-qa-candidate\.mjs/);
assert.match(android, /node scripts\/verify-generated-physical-qa-candidate\.mjs PHYSICAL_QA_CANDIDATE\.generated\.json/);
assert.match(android, /PHYSICAL_QA_CANDIDATE\.generated\.json/);
assert.match(android, /physical-qa-candidate-\$\{\{ github\.run_number \}\}/);
assert.match(android, /gate_run_id=\$\{TUTOP_VALIDATED_GATE_RUN_ID\}/);
assert.match(android, /staging_smoke_run_id=\$\{TUTOP_VALIDATED_STAGING_RUN_ID\}/);
assert.match(android, /apk_sha256=\$\{APK_SHA256\}/);
assert.match(android, /apk_size_bytes=\$\{APK_SIZE\}/);

assert.match(runbook, /NEW EXACT-HEAD CANDIDATE REQUIRED/);
assert.match(runbook, /PHYSICAL_QA_CANDIDATE_0\.9\.json` actualizado únicamente con datos reales/);
assert.match(runbook, /No inventar artifact ID, run ID, SHA, tamaño, timestamp ni evidencia/);

console.log('PASS canonical repository candidate remains explicitly obsolete until real activation');
console.log('PASS Android build derives candidate identity from exact SHA/tree/runtime refs and real upload artifact ID');
console.log('PASS generated candidate is verified against the checkout before artifact/release publication');
console.log('PASS cutover flags and same-SHA gate/staging run IDs are bound into candidate metadata');
console.log('Physical QA exact candidate generation contract: PASS');
