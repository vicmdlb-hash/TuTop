import fs from 'node:fs';
import { firebaseCiAccessToken } from './firebase-ci-auth.mjs';

const projectId = String(process.env.TUTOP_FIREBASE_PROJECT_ID || '').trim();
const outputPath = String(process.env.TUTOP_STAGING_WEB_CONFIG_PATH || '.tutop-staging-web-config.json').trim();
const historicalProject = 'tutop-3a4f7';

function stop(message) { console.error(`DETENIDO: ${message}`); process.exit(2); }
if (!projectId) stop('falta TUTOP_FIREBASE_PROJECT_ID.');
if (projectId === historicalProject) stop(`${historicalProject} está bloqueado para staging V2.`);
if (/prod(uction)?/i.test(projectId) && process.env.TUTOP_ALLOW_PRODUCTION_FIREBASE !== '1') stop('el project ID parece producción.');
if (!/(staging|stage|beta|dev|test|sandbox)/i.test(projectId) && process.env.TUTOP_ALLOW_NONDESCRIPTIVE_STAGING_ID !== '1') stop('el project ID no parece staging/beta/dev/test.');

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

await enableService('identitytoolkit.googleapis.com');
await enableService('firebase.googleapis.com');

const authConfigUrl = `https://identitytoolkit.googleapis.com/admin/v2/projects/${encodeURIComponent(projectId)}/config`;
let authConfig = await jsonRequest(authConfigUrl, {}, [404]);
if (authConfig.status === 404) {
  const initUrl = `https://identitytoolkit.googleapis.com/v2/projects/${encodeURIComponent(projectId)}/identityPlatform:initializeAuth`;
  await jsonRequest(initUrl, { method: 'POST', body: '{}' }, [409]);
  for (let i = 0; i < 20; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    authConfig = await jsonRequest(authConfigUrl, {}, [404]);
    if (authConfig.status === 200) break;
  }
}
if (authConfig.status !== 200) throw new Error('Firebase Auth no pudo inicializarse en staging.');

await jsonRequest(`${authConfigUrl}?updateMask=signIn.email.enabled,signIn.email.passwordRequired`, {
  method: 'PATCH',
  body: JSON.stringify({ name: `projects/${projectId}/config`, signIn: { email: { enabled: true, passwordRequired: true } } }),
});

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

fs.writeFileSync(outputPath, JSON.stringify({
  apiKey: config.apiKey,
  authDomain: config.authDomain || `${projectId}.firebaseapp.com`,
  projectId: config.projectId,
  appId: config.appId,
}, null, 2), { mode: 0o600 });

console.log(`✅ Firebase Auth email/password listo en ${projectId}.`);
console.log(`✅ Firebase Web App lista para smoke E2E (${app.displayName || 'TuTop staging'}).`);
console.log(`✅ Config runtime escrita en ${outputPath} sin imprimir credenciales de sesión.`);
