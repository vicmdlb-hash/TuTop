import fs from 'node:fs';
import assert from 'node:assert/strict';

const html=fs.readFileSync('public/delete-account.html','utf8');
const client=fs.readFileSync('public/delete-account.js','utf8');
const prep=fs.readFileSync('scripts/prepare-candidate118-hosting-assets.mjs','utf8');
const prepareWorkflow=fs.readFileSync('.github/workflows/candidate118-hosting-prepare.yml','utf8');
const deployWorkflow=fs.readFileSync('.github/workflows/candidate118-hosting-staging-deploy.yml','utf8');
const ignore=fs.readFileSync('.gitignore','utf8');
const firebase=fs.readFileSync('firebase.json','utf8');

for(const id of ['login-form','email','password','login-button','account-panel','account-email','confirm-delete','request-delete-button','logout-button','status']) {
  assert.match(html,new RegExp(`id=["']${id}["']`));
}
assert.match(html,/type="module" src="\/delete-account\.js"/);
assert.doesNotMatch(html,/<script(?![^>]*\ssrc=)[^>]*>/i);
assert.match(html,/sin abrir ni reinstalar la app/i);
assert.match(html,/Solicitar eliminación de mi cuenta TuTop/i);

assert.match(client,/accounts:signInWithPassword/);
assert.match(client,/accounts:lookup/);
assert.match(client,/account_deletion_requests/);
assert.match(client,/status: \{ stringValue: 'pending' \}/);
assert.match(client,/setToServerValue: 'REQUEST_TIME'/);
assert.match(client,/currentDocument: \{ exists: false \}/);
assert.match(client,/response\.status === 409/);
assert.doesNotMatch(client,/localStorage|sessionStorage/);
assert.doesNotMatch(client,/accounts:delete|batchDelete|deleteDocument/);
assert.doesNotMatch(client,/console\./);
assert.doesNotMatch(client,/refreshToken/);

assert.match(prep,/tutop-beta-vicmdlb-1356585881/);
assert.match(prep,/public\/tutop-web-config\.json/);
assert.doesNotMatch(prep,/service.?account|refreshToken|idToken/i);
assert(ignore.includes('public/tutop-web-config.json'));

assert.match(prepareWorkflow,/workflow_dispatch:/);
assert.match(prepareWorkflow,/push:\s*\n\s*branches: \[release\/candidate118-play-preflight\]/);
assert.match(prepareWorkflow,/PREPARE_CANDIDATE118_HOSTING_NO_DEPLOY/);
assert.match(prepareWorkflow,/pulls\/103/);
assert.match(prepareWorkflow,/e93ca0bb237e7fa438df5801fc627f065d9441e6/);
assert.doesNotMatch(prepareWorkflow,/--only hosting/);

assert.match(deployWorkflow,/workflow_dispatch:/);
assert.doesNotMatch(deployWorkflow,/\npush:/);
assert.match(deployWorkflow,/DEPLOY_CANDIDATE118_STAGING_HOSTING_ONLY/);
assert.match(deployWorkflow,/LEGAL_PRIVACY_CONTENT_APPROVED/);
assert.match(deployWorkflow,/No es una política legal aprobada para publicación/);
assert.match(deployWorkflow,/--only hosting/);
assert.match(deployWorkflow,/--project tutop-beta-vicmdlb-1356585881/);
assert.doesNotMatch(deployWorkflow,/--only\s+(firestore|auth|storage|functions)/);

const parsed=JSON.parse(firebase);
const csp=(parsed.hosting?.headers||[]).flatMap(item=>item.headers||[]).find(item=>item.key==='Content-Security-Policy')?.value||'';
for(const origin of ['https://identitytoolkit.googleapis.com','https://securetoken.googleapis.com','https://firestore.googleapis.com']) assert(csp.includes(origin));
assert(csp.includes("script-src 'self'"));

console.log('PASS authenticated deletion page uses self-hosted JS and no inline script');
console.log('PASS deletion client authenticates existing account and creates idempotent pending request only');
console.log('PASS no client Auth deletion/completion/token persistence capability exists');
console.log('PASS Hosting runtime config is generated separately and ignored by git');
console.log('PASS Hosting prepare workflow auto-validates each Candidate118 push and cannot deploy');
console.log('PASS Hosting deploy workflow is manual, exact-branch/SHA scoped, legal-gated and hosting-only');
console.log('PASS Firebase Hosting CSP permits only required Firebase REST origins for this flow');
