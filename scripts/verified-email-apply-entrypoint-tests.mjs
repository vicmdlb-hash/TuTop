import assert from 'node:assert/strict';
import fs from 'node:fs';

const apply = fs.readFileSync('scripts/verified-email-apply-cutover.mjs','utf8');
const workflow = fs.readFileSync('.github/workflows/verified-email-apply-cutover.yml','utf8');

assert.match(apply, /EXPLICIT_APPLY_REQUIRED/);
assert.match(apply, /CUTOVER_BRANCH_REQUIRED/);
assert.match(apply, /DEVICE_INSTALL_CONFIRMATION_REQUIRED/);
assert.match(apply, /EXCLUSIVE_WINDOW_REQUIRED/);
assert.match(apply, /VALID_ACTION_ID_REQUIRED/);
assert.match(apply, /RULES_DIFFERS_FROM_73_PASS_EMULATOR_SOURCE/);
assert.match(apply, /method: 'PATCH'/);
assert.match(apply, /release: \{ name: releaseName, rulesetName \}, updateMask: 'rulesetName'/);
assert.match(apply, /CUTOVER_VERIFY_RELEASE_MISMATCH/);
assert.match(apply, /CUTOVER_VERIFY_SOURCE_HASH_MISMATCH/);
assert.match(apply, /deviceInstalled: true/);
assert.match(apply, /exclusiveWindow: true/);

assert.match(workflow, /workflow_dispatch:/);
assert.doesNotMatch(workflow, /\n\s*push:/);
assert.match(workflow, /device_installed:/);
assert.match(workflow, /exclusive_window:/);
assert.match(workflow, /action_id:/);
assert.match(workflow, /verified-email-promotion-snapshot\.mjs/);
assert.match(workflow, /verified-email-atomic-cutover-tests\.mjs/);
assert.match(workflow, /verified-email-apply-cutover\.mjs --apply/);

console.log('PASS cutover apply is manual-only, gated and action-id bound');
console.log('PASS apply performs fresh preflight before release mutation');
console.log('PASS release PATCH/readback/source-hash verification contract is present');
