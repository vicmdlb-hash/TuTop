import assert from 'node:assert/strict';
import fs from 'node:fs';

const ui = fs.readFileSync('src/admin/AccountDeletionQueue.tsx','utf8');
const backend = fs.readFileSync('src/services/scopedAdminBackend.ts','utf8');
const processor = fs.readFileSync('scripts/process-account-erasure.mjs','utf8');
const rulesPrep = fs.readFileSync('scripts/prepare-firestore-v2-rules.mjs','utf8');
const workflow = fs.readFileSync('.github/workflows/staging-v2-smoke.yml','utf8');

assert.equal(ui.includes("transition(request, 'completed')"), false, 'admin UI must not expose direct completed transition');
assert.match(ui, /sólo el procesador controlado puede cerrar la solicitud/);
assert.doesNotMatch(backend, /'processing' \| 'completed' \| 'rejected'/);
assert.match(backend, /status: 'processing' \| 'rejected'/);

assert.match(rulesPrep, /affectedKeys\(\)\.hasOnly\(\['status','updated_at'\]\)/);
assert.doesNotMatch(rulesPrep, /status in \['pending','processing','completed','rejected'\]/);

assert.match(processor, /TUTOP_ERASURE_RUN_ID/);
assert.match(processor, /processor_run_id: processorRunId/);
assert.match(processor, /completed_at: completedAt/);
assert.match(processor, /erasure_policy_version: 'staging-account-erasure-v1'/);
assert.match(processor, /auth_deleted: true/);
assert.match(processor, /deleted_count: plan\.delete_paths\.length \+ 1/);
assert.match(processor, /withdrawn_count: plan\.withdrawals\.length/);
const authDelete = processor.indexOf('await adminDeleteTestUsers([uid])');
const completedPatch = processor.indexOf("status: 'completed'", authDelete);
assert(authDelete >= 0 && completedPatch > authDelete, 'Auth deletion must succeed before completed is written');

assert.match(workflow, /TUTOP_ERASURE_RUN_ID: \$\{\{ github\.run_id \}\}/);

console.log('PASS account-erasure completion is trusted-runner-only and attested after Auth deletion');
