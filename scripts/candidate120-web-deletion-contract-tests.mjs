import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { trustedWebDeletionStatus } from '../public/deletion-completion-proof.js';
import { deletionJsonRequest, DELETION_REQUEST_TIMEOUT_MS } from '../public/deletion-request-timeout.js';

const read = (path) => fs.readFileSync(path, 'utf8').replace(/\r\n/g, '\n');

const html=read('public/delete-account.html');
const client=read('public/delete-account.js');
const privacy=read('public/privacy.html');
const prep=read('scripts/prepare-candidate120-hosting-assets.mjs');
const workflow=read('.github/workflows/candidate120-hosting-prepare.yml');
const ignore=read('.gitignore');
const firebase=JSON.parse(read('firebase.json'));

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

// The public account-deletion workflow must never hang forever on Firebase.
// A timed-out commit has an unknown outcome; the UI re-reads before any retry.
assert.equal(DELETION_REQUEST_TIMEOUT_MS, 15000);
assert.match(client, /deletionJsonRequest\(CONFIG_URL/);
assert.match(client, /deletionJsonRequest\(requestDocumentUrl\(\)/);
assert.match(client, /acceptNotFound: true/);
assert.match(client, /const existing = await readDeletionRequest\(\)\.catch\(\(\) => null\)/);
assert.doesNotMatch(client, /await fetch\(/);
assert.match(client, /Consulta su estado antes de volver a intentar/);
// A temporary status-read failure must not tear down a valid Firebase Auth
// session or falsely tell the owner that credentials were rejected.
const loginHandler = client.slice(client.indexOf("loginForm.addEventListener('submit'"), client.indexOf("confirmInput.addEventListener"));
assert.match(loginHandler, /try \{\s*await refreshRequestStatus\(\);\s*\} catch \{/);
assert.match(loginHandler, /La sesión se inició, pero no pudimos consultar el estado de eliminación/);
assert.match(loginHandler, /\} catch \{\s*clearSession\(\);/);

// A pending request must never be re-enabled by changing confirmation.
const busyHandler = client.slice(client.indexOf('function setBusy('), client.indexOf('function clearSession('));
assert.match(busyHandler, /state\.busy = Boolean\(busy\)/);
assert.match(client, /confirmInput\.addEventListener\('change', \(\) => setBusy\(state\.busy\)\)/);
assert.match(client, /if \(state\.busy \|\| !state\.session \|\| !confirmInput\.checked\) return/);
assert.match(loginHandler, /if \(state\.busy\) return/);
const busyContext = {
  state: { busy: false, session: { uid: 'synthetic-uid' } },
  loginButton: { disabled: false },
  logoutButton: { disabled: false },
  requestButton: { disabled: false },
  confirmInput: { checked: true, disabled: false },
};
vm.runInNewContext(busyHandler + '\nsetBusy(true);', busyContext);
assert.equal(busyContext.state.busy, true);
for (const button of ['loginButton', 'logoutButton', 'requestButton', 'confirmInput']) {
  assert.equal(busyContext[button].disabled, true, `${button} must stay disabled while pending`);
}
busyContext.confirmInput.checked = false;
vm.runInNewContext('setBusy(state.busy);', busyContext);
assert.equal(busyContext.requestButton.disabled, true, 'checkbox changes cannot unlock pending writes');
assert.equal(busyContext.logoutButton.disabled, true, 'checkbox changes cannot unlock logout');
vm.runInNewContext('setBusy(false);', busyContext);
assert.equal(busyContext.state.busy, false);
assert.equal(busyContext.logoutButton.disabled, false);
assert.equal(busyContext.requestButton.disabled, true, 'unchecked confirmation cannot submit after release');
busyContext.confirmInput.checked = true;
vm.runInNewContext('setBusy(state.busy);', busyContext);
assert.equal(busyContext.requestButton.disabled, false, 'confirmed idle request is available');

// Shared-device logout removes both token/session and the prior email value.
const clearSessionHandler = client.slice(client.indexOf('function clearSession('), client.indexOf('async function loadConfig('));
const sharedDeviceContext = {
  state: { busy: false, session: { uid: 'account-A', idToken: 'synthetic-token' } },
  emailInput: { value: 'synthetic@example.test' },
  passwordInput: { value: 'synthetic-password' },
  accountEmail: { textContent: 'synthetic@example.test' },
  accountPanel: { hidden: false },
  loginForm: { hidden: true },
  confirmInput: { checked: true, disabled: false },
  loginButton: { disabled: false },
  logoutButton: { disabled: false },
  requestButton: { disabled: false },
};
vm.runInNewContext(busyHandler + '\n' + clearSessionHandler + '\nclearSession();', sharedDeviceContext);
assert.equal(sharedDeviceContext.state.session, null, 'logout removes current session');
assert.equal(sharedDeviceContext.emailInput.value, '', 'logout removes last account email from shared form');
assert.equal(sharedDeviceContext.passwordInput.value, '', 'logout clears password');
assert.equal(sharedDeviceContext.accountEmail.textContent, '', 'logout clears account panel email');
assert.equal(sharedDeviceContext.accountPanel.hidden, true);
assert.equal(sharedDeviceContext.loginForm.hidden, false);
assert.equal(sharedDeviceContext.requestButton.disabled, true, 'logout never leaves deletion enabled');




const successfulRequest = await deletionJsonRequest('/test', {}, {
  fetchImpl: async () => new Response('{"status":"pending"}', { status: 200 }),
});
assert.equal(successfulRequest.data.status, 'pending');
const absentRequest = await deletionJsonRequest('/test', {}, {
  acceptNotFound: true,
  fetchImpl: async () => new Response('', { status: 404 }),
});
assert.deepEqual(absentRequest, { status: 404, data: null });
await assert.rejects(
  deletionJsonRequest('/test', {}, {
    fetchImpl: async () => new Response('{"error":{"status":"PERMISSION_DENIED"}}', { status: 403 }),
  }),
  (error) => error.message === 'REMOTE_REQUEST_FAILED' && error.status === 403 &&
    error.remoteStatus === 'PERMISSION_DENIED',
);
let commitAttempts = 0;
await assert.rejects(
  deletionJsonRequest('/commit', { method: 'POST' }, {
    timeoutMs: 12,
    fetchImpl: (_url, { signal }) => {
      commitAttempts += 1;
      return new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true });
      });
    },
  }),
  { name: 'AbortError' },
);
assert.equal(commitAttempts, 1, 'ambiguous commit must not be automatically retried');

// Abort must also cover a response body that never resolves.
await assert.rejects(
  deletionJsonRequest('/body', {}, {
    timeoutMs: 12,
    fetchImpl: async (_url, { signal }) => ({
      status: 200,
      ok: true,
      text: () => new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true });
      }),
    }),
  }),
  { name: 'AbortError' },
);


assert.match(prep,/tutop-beta-vicmdlb-1356585881/);
assert.match(prep,/public\/tutop-web-config\.json/);
assert.doesNotMatch(prep,/service.?account|refreshToken|idToken/i);
assert(ignore.includes('public/tutop-web-config.json'));
assert(ignore.includes('.tutop-staging-web-config.json'));

assert.match(workflow,/^# RETIRED:/);
assert.match(workflow,/^name: RETIRED — /m);
assert.match(workflow,/\non:\n\s+workflow_dispatch:\n\npermissions:/);
assert.match(workflow,/^  prepare:\n[\s\S]*?^    if: \$\{\{ false \}\}/m);
assert.doesNotMatch(workflow,/\n\s+push:|\n\s+pull_request:|\n\s+schedule:/);
assert.doesNotMatch(workflow,/firebase deploy|--only hosting/);

const csp=(firebase.hosting?.headers||[]).flatMap(item=>item.headers||[]).find(item=>item.key==='Content-Security-Policy')?.value||'';
for(const origin of ['https://identitytoolkit.googleapis.com','https://securetoken.googleapis.com','https://firestore.googleapis.com']) assert(csp.includes(origin));
assert(csp.includes("script-src 'self'"));
const deleteHeaders=(firebase.hosting?.headers||[]).find(item=>item.source==='/delete-account*')?.headers||[];
const configHeaders=(firebase.hosting?.headers||[]).find(item=>item.source==='/tutop-web-config.json')?.headers||[];
assert(deleteHeaders.some(item=>item.key==='Cache-Control'&&item.value==='no-store'));
assert(configHeaders.some(item=>item.key==='Cache-Control'&&item.value==='no-store'));

assert.match(privacy,/PR #123/);
assert.match(privacy,/Build120 y Build121 son antecedentes históricos, no candidatos actuales/);
assert.match(privacy,/audiencia prevista es nacional/i);
assert.match(privacy,/No es una política legal aprobada/i);
assert.match(privacy,/flujo web autenticado/i);
assert.doesNotMatch(privacy,/[A-Z0-9._%+-]+@gmail\.com/i);

// A public web page must not show deletion complete merely because a caller
// can read a string status; the trusted runner adds independent evidence.
assert.match(client, /trustedWebDeletionStatus\(document\)/);
assert.match(client, /status === 'completion-unverified'/);
assert.match(client, /status === 'completion-unverified' \? 'error'/);
assert.doesNotMatch(client, /setStatus\(statusMessage\(decodeStatus\(document\)\), 'success'\)/);
const now = Date.parse('2026-10-27T23:00:00.000Z');
const fields = {
  status: { stringValue: 'completed' },
  requested_at: { timestampValue: '2026-10-26T10:00:00Z' },
  completed_at: { timestampValue: '2026-10-27T22:00:00Z' },
  auth_deleted: { booleanValue: true },
  processor_run_id: { stringValue: 'trusted-run-123' },
  erasure_policy_version: { stringValue: 'staging-account-erasure-v1' },
  residual_manifest_version: { stringValue: 'staging-erasure-residual-v2' },
  deleted_count: { integerValue: '6' },
  withdrawn_count: { integerValue: '2' },
  retained_count: { integerValue: '0' },
};
assert.equal(trustedWebDeletionStatus({ fields }, now), 'completed');
assert.equal(trustedWebDeletionStatus({ fields: {
  ...fields,
  requested_at: { timestampValue: '2026-10-26T10:00:00.000000001Z' },
  completed_at: { timestampValue: '2026-10-27T22:00:00.123456789Z' },
} }, now), 'completed', 'nanosecond-precision Firestore evidence remains eligible');
assert.equal(trustedWebDeletionStatus({ fields: {
  ...fields,
  requested_at: { timestampValue: '2026-10-27T22:00:00.000000009Z' },
  completed_at: { timestampValue: '2026-10-27T22:00:00.000000008Z' },
} }, now), 'completion-unverified', 'nanosecond-order inversion must fail closed');
assert.equal(trustedWebDeletionStatus({ fields: {
  ...fields,
  requested_at: { timestampValue: '2026-02-31T00:00:00.123456789Z' },
} }, now), 'completion-unverified', 'high-precision impossible day must not pass');

const malformedCalendarComplete = {
  ...fields,
  requested_at: { timestampValue: '2026-02-01T00:00:00Z' },
  completed_at: { timestampValue: '2026-02-31T01:00:00Z' },
};
assert.equal(trustedWebDeletionStatus({ fields: malformedCalendarComplete }, now),
  'completion-unverified', 'calendar-normalized impossible completion must be denied');
assert.equal(trustedWebDeletionStatus({ fields: {
  ...fields, requested_at: { timestampValue: '2026-02-31T00:00:00Z' },
} }, now), 'completion-unverified', 'calendar-normalized impossible request must be denied');
assert.equal(trustedWebDeletionStatus({ fields: {
  ...fields,
  requested_at: { timestampValue: '2024-02-29T00:00:00Z' },
  completed_at: { timestampValue: '2024-02-29T01:00:00Z' },
} }, now), 'completed', 'valid leap-day proof remains accepted');

for (const absent of ['auth_deleted', 'processor_run_id', 'erasure_policy_version',
  'residual_manifest_version', 'completed_at', 'requested_at',
  'deleted_count', 'withdrawn_count', 'retained_count']) {
  const reduced = { ...fields };
  delete reduced[absent];
  assert.equal(trustedWebDeletionStatus({ fields: reduced }, now), 'completion-unverified',
    `completed without ${absent} must not be trusted`);
}
assert.equal(trustedWebDeletionStatus({ fields: { ...fields, auth_deleted: { booleanValue: false } } }, now),
  'completion-unverified');
assert.equal(trustedWebDeletionStatus({ fields: { ...fields, deleted_count: { integerValue: '-1' } } }, now),
  'completion-unverified');
assert.equal(trustedWebDeletionStatus({ fields: { ...fields, retained_count: { integerValue: '9007199254740993' } } }, now),
  'completion-unverified');
assert.equal(trustedWebDeletionStatus({ fields: { ...fields, completed_at: { timestampValue: '2026-10-25T22:00:00Z' } } }, now),
  'completion-unverified');
assert.equal(trustedWebDeletionStatus({ fields: { ...fields, completed_at: { timestampValue: '2026-10-30T22:00:00Z' } } }, now),
  'completion-unverified');
for (const status of ['pending', 'processing', 'rejected']) {
  assert.equal(trustedWebDeletionStatus({ fields: { status: { stringValue: status } } }, now), status);
}
assert.equal(trustedWebDeletionStatus(null, now), 'unknown');

console.log('PASS Build120 web deletion flow authenticates the existing account and can create only a pending owner request');
console.log('PASS runtime Firebase web config is generated separately and ignored by git');
console.log('PASS historical Build120 Hosting workflow is hard-disabled and cannot deploy');
console.log('PASS privacy draft names PR123, nationwide scope and Build120/121 as historical');
console.log('PASS privacy remains explicitly draft/legal-pending rather than fabricated as approved');
