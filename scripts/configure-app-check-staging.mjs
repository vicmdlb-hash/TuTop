import { firebaseCiAccessToken } from './firebase-ci-auth.mjs';
import { assertAppCheckFreezeMode, assertStagingFreezeContext } from './staging-freeze-guard.mjs';

const projectId = assertStagingFreezeContext({
  allowEnv: 'TUTOP_ALLOW_APP_CHECK',
  allowValue: 'staging-v2',
});
const mode = assertAppCheckFreezeMode(process.env.TUTOP_APP_CHECK_MODE || 'UNENFORCED');

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
console.log(`October gate run: ${process.env.TUTOP_VALIDATED_GATE_RUN_ID}`);
if (mode === 'UNENFORCED') console.log('Se recopilan métricas sin bloquear clientes; ENFORCED permanece bloqueado durante Runtime Freeze Candidate.');
