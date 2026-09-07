import fs from 'node:fs';
import assert from 'node:assert/strict';

const workflow = fs.readFileSync('.github/workflows/ci-auth-parallel-validation.yml', 'utf8');
assert.match(workflow, /workflow_dispatch:/);
assert.match(workflow, /id-token: write/);
assert.match(workflow, /FIREBASE_TOKEN: \$\{\{ secrets\.FIREBASE_TOKEN \}\}/);
assert.match(workflow, /ACTIONS_ID_TOKEN_REQUEST_URL/);
assert.match(workflow, /audience=tutop-staging-wif/);
assert.match(workflow, /assertion not persisted or exchanged/);
assert.match(workflow, /TUTOP_WIF_PROVIDER/);
assert.match(workflow, /TUTOP_WIF_SERVICE_ACCOUNT/);
assert.match(workflow, /never removes FIREBASE_TOKEN/);
assert.doesNotMatch(workflow, /firebase deploy|gcloud auth|google-github-actions\/auth/);
assert.doesNotMatch(workflow, /on:\s*\n\s*push:/);
console.log('PASS OIDC shadow validation is manual-only');
console.log('PASS legacy FIREBASE_TOKEN fallback remains present');
console.log('PASS GitHub OIDC assertion is minted but not exchanged or persisted');
console.log('CI auth parallel workflow contract: PASS');
