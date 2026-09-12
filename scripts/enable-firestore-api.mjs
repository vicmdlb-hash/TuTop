import { firebaseCiAccessToken } from './firebase-ci-auth.mjs';
import { assertStagingFreezeContext } from './staging-freeze-guard.mjs';

const projectId = assertStagingFreezeContext();
const token = await firebaseCiAccessToken();
const serviceName = 'firestore.googleapis.com';
const base = `https://serviceusage.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/services/${serviceName}`;

async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`${response.status}: ${detail.slice(0, 800)}`);
  }
  return response.status === 204 ? null : response.json();
}

async function serviceEnabled() {
  try {
    const data = await request(base);
    return data?.state === 'ENABLED';
  } catch (error) {
    if (String(error.message).startsWith('404:')) return false;
    throw error;
  }
}

if (await serviceEnabled()) {
  console.log(`✅ Cloud Firestore API ya está habilitada en ${projectId}.`);
  process.exit(0);
}

console.log(`Habilitando Cloud Firestore API en ${projectId}...`);
const operation = await request(`${base}:enable`, { method: 'POST', body: '{}' });

if (operation?.name && operation.done !== true) {
  const operationUrl = `https://serviceusage.googleapis.com/v1/${operation.name}`;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const current = await request(operationUrl);
    if (current?.done) {
      if (current.error) throw new Error(`Service Usage no pudo habilitar Firestore: ${JSON.stringify(current.error)}`);
      break;
    }
    if (attempt === 29) throw new Error('Timeout esperando que Service Usage habilite Cloud Firestore API.');
  }
}

for (let attempt = 0; attempt < 20; attempt += 1) {
  if (await serviceEnabled()) {
    console.log(`✅ Cloud Firestore API habilitada en ${projectId}.`);
    process.exit(0);
  }
  await new Promise((resolve) => setTimeout(resolve, 2000));
}

throw new Error('Cloud Firestore API no alcanzó estado ENABLED dentro del tiempo esperado.');
