import { firebaseCiAccessToken } from './firebase-ci-auth.mjs';

const projectId = String(process.env.TUTOP_FIREBASE_PROJECT_ID || '').trim();
const allow = String(process.env.TUTOP_ALLOW_APP_CHECK || '').trim();
const mode = String(process.env.TUTOP_APP_CHECK_MODE || 'UNENFORCED').trim().toUpperCase();
const historicalProject = 'tutop-3a4f7';

function stop(message) { console.error(`DETENIDO: ${message}`); process.exit(2); }
if (!projectId) stop('falta TUTOP_FIREBASE_PROJECT_ID.');
if (allow !== 'staging-v2') stop('define TUTOP_ALLOW_APP_CHECK=staging-v2.');
if (projectId === historicalProject) stop(`${historicalProject} está bloqueado.`);
if (/prod(uction)?/i.test(projectId) && process.env.TUTOP_ALLOW_PRODUCTION_FIREBASE !== '1') stop('el project ID parece producción.');
if (!/(staging|stage|beta|dev|test|sandbox)/i.test(projectId) && process.env.TUTOP_ALLOW_NONDESCRIPTIVE_STAGING_ID !== '1') stop('el project ID no parece staging/beta/dev/test.');
if (!['OFF', 'UNENFORCED', 'ENFORCED'].includes(mode)) stop(`modo App Check inválido: ${mode}`);
if (mode === 'ENFORCED' && process.env.TUTOP_ALLOW_APP_CHECK_ENFORCEMENT !== 'staging-v2-client-ready') {
  stop('ENFORCED requiere TUTOP_ALLOW_APP_CHECK_ENFORCEMENT=staging-v2-client-ready después de validar un APK que envíe tokens App Check.');
}

const token = await firebaseCiAccessToken();
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Goog-User-Project': projectId };
async function request(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { ...headers, ...(options.headers || {}) } });
  const text = await response.text();
  let data = null;
  if (text) { try { data = JSON.parse(text); } catch { data = { raw: text }; } }
  if (!response.ok) throw new Error(`${response.status} ${url}: ${text.slice(0, 800)}`);
  return data;
}

async function enableService(serviceName) {
  const base = `https://serviceusage.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/services/${serviceName}`;
  const current = await request(base);
  if (current?.state === 'ENABLED') return;
  const operation = await request(`${base}:enable`, { method: 'POST', body: '{}' });
  if (operation?.name && !operation.done) {
    for (let i = 0; i < 40; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const result = await request(`https://serviceusage.googleapis.com/v1/${operation.name}`);
      if (result?.done) {
        if (result.error) throw new Error(JSON.stringify(result.error));
        return;
      }
    }
    throw new Error(`Timeout habilitando ${serviceName}`);
  }
}

await enableService('firebaseappcheck.googleapis.com');
const project = await request(`https://cloudresourcemanager.googleapis.com/v1/projects/${encodeURIComponent(projectId)}`);
const projectNumber = String(project.projectNumber || '').trim();
if (!projectNumber) throw new Error('Cloud Resource Manager no devolvió projectNumber.');

for (const serviceId of ['firestore.googleapis.com', 'identitytoolkit.googleapis.com']) {
  const name = `projects/${projectNumber}/services/${serviceId}`;
  await request(`https://firebaseappcheck.googleapis.com/v1/${name}?updateMask=enforcementMode`, {
    method: 'PATCH',
    body: JSON.stringify({ name, enforcementMode: mode }),
  });
  const current = await request(`https://firebaseappcheck.googleapis.com/v1/${name}`);
  if (current?.enforcementMode !== mode) throw new Error(`${serviceId} no quedó en ${mode}.`);
  console.log(`✅ App Check ${serviceId}: ${current.enforcementMode}`);
}

console.log(`✅ App Check staging configurado en ${mode}.`);
if (mode === 'UNENFORCED') console.log('Se recopilan métricas sin bloquear al APK anterior. Enforcement queda deliberadamente bloqueado hasta validar el cliente App Check.');
