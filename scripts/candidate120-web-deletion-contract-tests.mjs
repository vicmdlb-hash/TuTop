import fs from 'node:fs';
import assert from 'node:assert/strict';

const html=fs.readFileSync('public/delete-account.html','utf8');
const client=fs.readFileSync('public/delete-account.js','utf8');
const privacy=fs.readFileSync('public/privacy.html','utf8');
const prep=fs.readFileSync('scripts/prepare-candidate120-hosting-assets.mjs','utf8');
const workflow=fs.readFileSync('.github/workflows/candidate120-hosting-prepare.yml','utf8');
const ignore=fs.readFileSync('.gitignore','utf8');
const firebase=JSON.parse(fs.readFileSync('firebase.json','utf8'));

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
assert.doesNotMatch(client,/localStorage|sessionStorage/);
assert.doesNotMatch(client,/accounts:delete|batchDelete|deleteDocument/);
assert.doesNotMatch(client,/refreshToken/);

assert.match(prep,/tutop-beta-vicmdlb-1356585881/);
assert.match(prep,/public\/tutop-web-config\.json/);
assert.doesNotMatch(prep,/service.?account|refreshToken|idToken/i);
assert(ignore.includes('public/tutop-web-config.json'));
assert(ignore.includes('.tutop-staging-web-config.json'));

assert.match(workflow,/release\/candidate120-web-compliance-preflight/);
assert.match(workflow,/554f4ef6d0429b0059738d8cd6e1b6e4890bda91/);
assert.match(workflow,/PREPARE_CANDIDATE120_HOSTING_NO_DEPLOY/);
assert.doesNotMatch(workflow,/firebase deploy|--only hosting/);

const csp=(firebase.hosting?.headers||[]).flatMap(item=>item.headers||[]).find(item=>item.key==='Content-Security-Policy')?.value||'';
for(const origin of ['https://identitytoolkit.googleapis.com','https://securetoken.googleapis.com','https://firestore.googleapis.com']) assert(csp.includes(origin));
assert(csp.includes("script-src 'self'"));
const deleteHeaders=(firebase.hosting?.headers||[]).find(item=>item.source==='/delete-account*')?.headers||[];
const configHeaders=(firebase.hosting?.headers||[]).find(item=>item.source==='/tutop-web-config.json')?.headers||[];
assert(deleteHeaders.some(item=>item.key==='Cache-Control'&&item.value==='no-store'));
assert(configHeaders.some(item=>item.key==='Cache-Control'&&item.value==='no-store'));

assert.match(privacy,/Build120 \/ PR #107 \/ SHA 554f4ef6d0429b0059738d8cd6e1b6e4890bda91/);
assert.doesNotMatch(privacy,/Build120 \/ PR #100|e93ca0bb237e7fa438df5801fc627f065d9441e6/);
assert.match(privacy,/fallos físicos abiertos en autenticación\/verificación, Topi real y activación de notificaciones/);
assert.match(privacy,/No es una política legal aprobada para publicación/);
assert.match(privacy,/flujo web autenticado/i);
assert.doesNotMatch(privacy,/[A-Z0-9._%+-]+@gmail\.com/i);

console.log('PASS Build120 web deletion flow authenticates the existing account and can create only a pending owner request');
console.log('PASS runtime Firebase web config is generated separately and ignored by git');
console.log('PASS Hosting prepare workflow is exact-Build120 scoped and cannot deploy');
console.log('PASS privacy provenance is exact PR107/Build120 SHA and stale Build118 identity is rejected');
console.log('PASS privacy remains explicitly draft/legal-pending rather than fabricated as approved');
