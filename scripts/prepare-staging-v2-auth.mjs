import fs from 'node:fs';
import { firebaseCiAccessToken } from './firebase-ci-auth.mjs';
import { assertStagingFreezeContext } from './staging-freeze-guard.mjs';

const projectId = assertStagingFreezeContext();
const outputPath = String(process.env.TUTOP_STAGING_WEB_CONFIG_PATH || '.tutop-staging-web-config.json').trim();

const token = await firebaseCiAccessToken();
const authHeaders = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Goog-User-Project': projectId };

async function jsonRequest(url, options = {}, allow = []) {
  const response = await fetch(url, { ...options, headers: { ...authHeaders, ...(options.headers || {}) } });
  const text = await response.text();
  let data = null;
  if (text) { try { data = JSON.parse(text); } catch { data = { raw: text }; } }
  if (!response.ok && !allow.includes(response.status)) throw new Error(`${response.status} ${url}: ${text.slice(0, 800)}`);
  return { status: response.status, data };
}

async function enableService(serviceName) {
  const base = `https://serviceusage.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/services/${serviceName}`;
  const current = await jsonRequest(base, {}, [404]);
  if (current.status === 200 && current.data?.state === 'ENABLED') return;
  const op = await jsonRequest(`${base}:enable`, { method: 'POST', body: '{}' });
  if (op.data?.name && !op.data.done) {
    for (let i = 0; i < 40; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const result = await jsonRequest(`https://serviceusage.googleapis.com/v1/${op.data.name}`);
      if (result.data?.done) {
        if (result.data.error) throw new Error(`No se pudo habilitar ${serviceName}: ${JSON.stringify(result.data.error)}`);
        return;
      }
    }
    throw new Error(`Timeout habilitando ${serviceName}.`);
  }
}

// Firebase Auth base is configured separately through `firebase deploy --only auth`.
// This helper deliberately does NOT call identityPlatform:initializeAuth, because
// that endpoint upgrades the project and can require billing.
await enableService('identitytoolkit.googleapis.com');
await enableService('firebase.googleapis.com');

const webAppsUrl = `https://firebase.googleapis.com/v1beta1/projects/${encodeURIComponent(projectId)}/webApps`;
const listed = await jsonRequest(webAppsUrl);
let app = (listed.data?.apps || []).find((item) => item.displayName === 'TuTop V2 Staging Smoke') || (listed.data?.apps || [])[0];

if (!app) {
  const created = await jsonRequest(webAppsUrl, { method: 'POST', body: JSON.stringify({ displayName: 'TuTop V2 Staging Smoke' }) });
  let operation = created.data;
  if (operation?.name && !operation.done) {
    for (let i = 0; i < 30; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      const polled = await jsonRequest(`https://firebase.googleapis.com/v1beta1/${operation.name}`);
      operation = polled.data;
      if (operation?.done) break;
    }
  }
  if (operation?.error) throw new Error(`No se pudo crear Firebase Web App: ${JSON.stringify(operation.error)}`);
  app = operation?.response;
}

if (!app?.name) throw new Error('No se encontró/creó Firebase Web App de staging.');
const appConfig = await jsonRequest(`https://firebase.googleapis.com/v1beta1/${app.name}/config`);
const config = appConfig.data || {};
if (!config.apiKey || !config.projectId || !config.appId) throw new Error('Firebase Web App no devolvió configuración completa.');
if (config.projectId !== projectId) throw new Error(`Firebase Web App project mismatch: ${config.projectId}`);

fs.writeFileSync(outputPath, JSON.stringify({
  apiKey: config.apiKey,
  authDomain: config.authDomain || `${projectId}.firebaseapp.com`,
  projectId: config.projectId,
  appId: config.appId,
}, null, 2), { mode: 0o600 });

console.log(`✅ Firebase Web App lista para smoke E2E (${app.displayName || 'TuTop staging'}).`);
console.log(`✅ Config runtime escrita en ${outputPath} sin imprimir credenciales de sesión.`);
