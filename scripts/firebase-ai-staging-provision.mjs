const FIREBASE_AI_LOGIC_SERVICE = 'firebasevertexai.googleapis.com';
const GEMINI_DEVELOPER_SERVICE = 'generativelanguage.googleapis.com';
const API_KEYS_SERVICE = 'apikeys.googleapis.com';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function safeText(value) {
  return String(value || '')
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, '[redacted-firebase-api-key]')
    .replace(/([?&]keyString=)[^&\s]+/gi, '$1[redacted]')
    .replace(/([?&]key=)[^&\s]+/gi, '$1[redacted]')
    .replace(/[A-Za-z0-9_-]{120,}/g, '[redacted-long-token]')
    .slice(0, 1200);
}

function authHeaders(projectId, token) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'X-Goog-User-Project': projectId,
  };
}

async function request(projectId, token, url, options = {}, allow = [], hideUrl = false) {
  const response = await fetch(url, {
    ...options,
    headers: { ...authHeaders(projectId, token), ...(options.headers || {}) },
  });
  const text = await response.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
  }
  if (!response.ok && !allow.includes(response.status)) {
    const target = hideUrl ? '[redacted-url]' : url;
    throw new Error(`${response.status} ${target}: ${safeText(text)}`);
  }
  return { status: response.status, data };
}

async function pollOperation(projectId, token, baseUrl, operation, label, attempts = 60) {
  let current = operation;
  if (!current?.name || current.done) {
    if (current?.error) throw new Error(`${label}: ${safeText(JSON.stringify(current.error))}`);
    return current;
  }
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await sleep(1500);
    current = (await request(projectId, token, `${baseUrl}/${current.name}`)).data;
    if (current?.done) {
      if (current.error) throw new Error(`${label}: ${safeText(JSON.stringify(current.error))}`);
      return current;
    }
  }
  throw new Error(`Timeout esperando ${label}.`);
}

async function enableService(projectId, token, serviceName) {
  const base = `https://serviceusage.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/services/${serviceName}`;
  const current = await request(projectId, token, base, {}, [404]);
  if (current.status === 200 && current.data?.state === 'ENABLED') return;
  const started = await request(projectId, token, `${base}:enable`, { method: 'POST', body: '{}' });
  await pollOperation(projectId, token, 'https://serviceusage.googleapis.com/v1', started.data, `habilitar ${serviceName}`);
  const verified = await request(projectId, token, base);
  if (verified.data?.state !== 'ENABLED') throw new Error(`${serviceName} no quedó ENABLED.`);
}

export async function ensureFirebaseAiServices({ projectId, token }) {
  if (!projectId || !token) throw new Error('Firebase AI staging provisioning requiere projectId + token.');

  // Gemini Developer API keeps this staging path compatible with Firebase Spark / zero-billing policy.
  for (const service of [GEMINI_DEVELOPER_SERVICE, FIREBASE_AI_LOGIC_SERVICE, API_KEYS_SERVICE]) {
    await enableService(projectId, token, service);
  }

  const project = await request(
    projectId,
    token,
    `https://cloudresourcemanager.googleapis.com/v1/projects/${encodeURIComponent(projectId)}`,
  );
  const projectNumber = String(project.data?.projectNumber || '').trim();
  if (!projectNumber) throw new Error('Cloud Resource Manager no devolvió projectNumber para Firebase AI Logic.');

  const parent = `projects/${projectNumber}/services/${FIREBASE_AI_LOGIC_SERVICE}`;
  const identity = await request(
    projectId,
    token,
    `https://serviceusage.googleapis.com/v1beta1/${parent}:generateServiceIdentity`,
    { method: 'POST', body: '{}' },
    [409],
  );
  if (identity.status !== 409) {
    const completed = await pollOperation(
      projectId,
      token,
      'https://serviceusage.googleapis.com/v1beta1',
      identity.data,
      'Firebase AI Logic service identity',
    );
    const email = String(completed?.response?.email || completed?.response?.identity?.email || '').trim();
    if (email && !email.endsWith('@gcp-sa-firebasevertexai.iam.gserviceaccount.com')) {
      throw new Error(`Firebase AI Logic devolvió identidad inesperada: ${safeText(email)}`);
    }
  }

  console.log('✅ Firebase AI Logic staging provisionado: Gemini Developer API + Firebase AI Logic API + P4SA solicitada/verificada.');
}

export async function ensureFirebaseAiApiKeyAllowlist({ projectId, token, apiKey }) {
  if (!projectId || !token || !apiKey) throw new Error('API-key allowlist check requiere projectId + token + apiKey.');
  await enableService(projectId, token, API_KEYS_SERVICE);

  const lookupUrl = `https://apikeys.googleapis.com/v2/keys:lookupKey?keyString=${encodeURIComponent(apiKey)}`;
  const lookup = await request(projectId, token, lookupUrl, {}, [403, 404], true);
  if (lookup.status !== 200 || !lookup.data?.name) {
    console.warn(`⚠️ No se pudo inspeccionar allowlist de la Firebase API key (HTTP ${lookup.status}); el runtime proof decidirá fail-closed.`);
    return;
  }

  const keyName = String(lookup.data.name);
  const key = await request(projectId, token, `https://apikeys.googleapis.com/v2/${keyName}`);
  const restrictions = key.data?.restrictions || {};
  const targets = Array.isArray(restrictions.apiTargets) ? restrictions.apiTargets : [];

  // No apiTargets means the key is not API-restricted; do not make it less compatible here.
  if (targets.length === 0) {
    console.log('✅ Firebase API key no tiene apiTargets restrictivos; Firebase AI Logic no requiere cambio de allowlist.');
    return;
  }
  if (targets.some((target) => target?.service === FIREBASE_AI_LOGIC_SERVICE)) {
    console.log('✅ Firebase API key ya permite Firebase AI Logic API.');
    return;
  }

  const nextRestrictions = {
    ...restrictions,
    apiTargets: [...targets, { service: FIREBASE_AI_LOGIC_SERVICE }],
  };
  const patched = await request(
    projectId,
    token,
    `https://apikeys.googleapis.com/v2/${keyName}?updateMask=restrictions`,
    { method: 'PATCH', body: JSON.stringify({ name: keyName, restrictions: nextRestrictions }) },
  );
  await pollOperation(projectId, token, 'https://apikeys.googleapis.com/v2', patched.data, 'Firebase API key allowlist update');
  await sleep(5000);
  console.log('✅ Firebase API key allowlist conserva restricciones existentes y añade únicamente Firebase AI Logic API.');
}
