import fs from 'node:fs';
import assert from 'node:assert/strict';

const workflow = fs.readFileSync('.github/workflows/ci-auth-parallel-validation.yml', 'utf8');
assert.match(workflow, /workflow_dispatch:/);
assert.match(workflow, /id-token: write/);
assert.match(workflow, /if: github\.ref_name == 'feat\/tutop-0\.8-p0'/);
assert.equal((workflow.match(/runs-on: ubuntu-latest/g) || []).length, 1, 'CI auth diagnostics must use one runner');
assert.match(workflow, /cancel-in-progress: true/);
assert.match(workflow, /FIREBASE_TOKEN: \$\{\{ secrets\.FIREBASE_TOKEN \}\}/);
assert.match(workflow, /TUTOP_FIREBASE_OAUTH_CLIENT_ID: \$\{\{ secrets\.FIREBASE_OAUTH_CLIENT_ID \}\}/);
assert.match(workflow, /TUTOP_FIREBASE_OAUTH_CLIENT_SECRET: \$\{\{ secrets\.FIREBASE_OAUTH_CLIENT_SECRET \}\}/);
assert.match(workflow, /Managed Firebase refresh-token \+ OIDC\/WIF readiness/);
assert.match(workflow, /Validate managed fallback readiness/);
assert.match(workflow, /ACTIONS_ID_TOKEN_REQUEST_URL/);
assert.match(workflow, /audience=tutop-staging-wif/);
assert.match(workflow, /assertion not persisted or exchanged/);
assert.match(workflow, /TUTOP_WIF_PROVIDER/);
assert.match(workflow, /TUTOP_WIF_SERVICE_ACCOUNT/);
assert.match(workflow, /never removes FIREBASE_TOKEN/);
assert.match(workflow, /Require managed fallback credentials before dependency setup/);

const credentialGate = workflow.indexOf('Require managed fallback credentials before dependency setup');
const checkout = workflow.indexOf('- name: Checkout');
const setupNode = workflow.indexOf('- name: Node 22');
const npmCi = workflow.indexOf('run: npm ci');
assert(credentialGate >= 0 && checkout > credentialGate, 'managed credential preflight must precede checkout');
assert(setupNode > credentialGate, 'managed credential preflight must precede setup-node');
assert(npmCi > credentialGate, 'managed credential preflight must precede npm ci');

assert.doesNotMatch(workflow, /firebase deploy|gcloud auth|google-github-actions\/auth/);
assert.doesNotMatch(workflow, /upload-artifact|gh release create/);
assert.doesNotMatch(workflow, /on:\s*\n\s*push:/);
console.log('PASS CI auth shadow validation is manual-only and branch-scoped');
console.log('PASS CI auth diagnostics use one runner instead of three');
console.log('PASS managed credential preflight occurs before checkout/setup-node/npm ci');
console.log('PASS refresh-token fallback remains present but requires managed OAuth client credentials');
console.log('PASS GitHub OIDC assertion is minted but not exchanged or persisted');
console.log('CI auth parallel workflow contract: PASS');
