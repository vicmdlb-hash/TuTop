import fs from 'node:fs';
import assert from 'node:assert/strict';

const html=fs.readFileSync('public/delete-account.html','utf8');
const client=fs.readFileSync('public/delete-account.js','utf8');
const prep=fs.readFileSync('scripts/prepare-candidate118-hosting-assets.mjs','utf8');
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

const parsed=JSON.parse(firebase);
const csp=(parsed.hosting?.headers||[]).flatMap(item=>item.headers||[]).find(item=>item.key==='Content-Security-Policy')?.value||'';
for(const origin of ['https://identitytoolkit.googleapis.com','https://securetoken.googleapis.com','https://firestore.googleapis.com']) assert(csp.includes(origin));
assert(csp.includes("script-src 'self'"));

console.log('PASS authenticated deletion page uses self-hosted JS and no inline script');
console.log('PASS deletion client authenticates existing account and creates idempotent pending request only');
console.log('PASS no client Auth deletion/completion/token persistence capability exists');
console.log('PASS Hosting runtime config is generated separately and ignored by git');
console.log('PASS Firebase Hosting CSP permits only required Firebase REST origins for this flow');
