import crypto from 'node:crypto';
import fs from 'node:fs';
import { initializeApp, deleteApp } from 'firebase/app';
import { CustomProvider, getToken as getAppCheckToken, initializeAppCheck } from 'firebase/app-check';
import { getAI, getGenerativeModel, GoogleAIBackend } from 'firebase/ai';
import { firebaseCiAccessToken } from './firebase-ci-auth.mjs';

const EXPECTED_PROJECT = 'tutop-beta-vicmdlb-1356585881';
const EXPECTED_MARKER = 'TUTOP_AI_RUNTIME_OK_091';
const MAX_ATTEMPTS = 12;
const RETRY_DELAY_MS = 15_000;
const configPath = String(process.env.TUTOP_STAGING_WEB_CONFIG_PATH || '.tutop-staging-web-config.json').trim();
const modelName = String(process.env.TUTOP_TOPI_AI_MODEL || 'gemini-3.8-flash').trim();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function fail(message) {
  throw new Error(message);
}

function safeError(error) {
  return String(error instanceof Error ? error.message : error)
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, '[redacted-firebase-api-key]')
    .replace(/([?&]key=)[^&\s]+/gi, '$1[redacted]')
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, '[redacted-debug-token]')
    .replace(/[A-Za-z0-9_-]{120,}/g, '[redacted-long-token]')
    .slice(0, 1200);
}

function isPropagationError(message) {
  return /api-not-enabled|API_KEY_SERVICE_BLOCKED|SERVICE_DISABLED|service identity|PERMISSION_DENIED|app.?check|403|429|temporarily unavailable|ECONNRESET|ETIMEDOUT|ENETUNREACH|fetch failed|503/i.test(message);
}

async function jsonRequest(url, options = {}, allowed = []) {
  const response = await fetch(url, options);
  const text = await response.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
  }
  if (!response.ok && !allowed.includes(response.status)) {
    throw new Error(`${response.status} ${url}: ${safeError(text)}`);
  }
  return { status: response.status, data };
}

async function createEphemeralDebugToken({ projectNumber, appId, oauthToken }) {
  const secret = crypto.randomUUID();
  const parent = `projects/${projectNumber}/apps/${appId}`;
  const created = await jsonRequest(
    `https://firebaseappcheck.googleapis.com/v1/${parent}/debugTokens`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${oauthToken}`,
        'Content-Type': 'application/json',
        'X-Goog-User-Project': EXPECTED_PROJECT,
      },
      body: JSON.stringify({
        displayName: `TuTop 0.9.1 staging CI ${process.env.GITHUB_RUN_ID || Date.now()}`,
        token: secret,
      }),
    },
  );
  const name = String(created.data?.name || '').trim();
  if (!name) fail('STAGING_APPCHECK_DEBUG_TOKEN_CREATE_MISSING_NAME');
  return { secret, name };
}

async function deleteEphemeralDebugToken({ name, oauthToken }) {
  if (!name) return;
  await jsonRequest(
    `https://firebaseappcheck.googleapis.com/v1/${name}`,
    {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${oauthToken}`,
        'X-Goog-User-Project': EXPECTED_PROJECT,
      },
    },
    [404],
  );
}

async function exchangeDebugToken({ projectNumber, appId, secret }) {
  let lastError = null;
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    try {
      const exchanged = await jsonRequest(
        `https://firebaseappcheck.googleapis.com/v1/projects/${projectNumber}/apps/${appId}:exchangeDebugToken`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ debugToken: secret, limitedUse: false }),
        },
      );
      const token = String(exchanged.data?.token || '').trim();
      const ttlSeconds = Number.parseFloat(String(exchanged.data?.ttl || '3600s').replace(/s$/i, ''));
      if (!token) fail('STAGING_APPCHECK_EXCHANGE_EMPTY_TOKEN');
      return {
        token,
        expireTimeMillis: Date.now() + Math.max(60_000, (Number.isFinite(ttlSeconds) ? ttlSeconds : 3600) * 1000 - 30_000),
      };
    } catch (error) {
      lastError = error;
      const message = safeError(error);
      if (attempt < 6 && isPropagationError(message)) {
        await sleep(5_000);
        continue;
      }
      throw error;
    }
  }
  throw lastError || new Error('STAGING_APPCHECK_EXCHANGE_NOT_PROVEN');
}

async function generateWithTimeout(model) {
  let timeoutId;
  try {
    const request = model.generateContent(
      `Health check de TuTop staging. Responde solamente con ${EXPECTED_MARKER}. No incluyas datos adicionales.`
    );
    const timeout = new Promise((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error('STAGING_TOPI_AI_TIMEOUT')), 30_000);
    });
    return await Promise.race([request, timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

let app = null;
let oauthToken = null;
let debugTokenName = null;
try {
  if (!fs.existsSync(configPath)) fail(`STAGING_TOPI_AI_CONFIG_MISSING:${configPath}`);
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  if (config?.projectId !== EXPECTED_PROJECT) fail(`STAGING_TOPI_AI_PROJECT_MISMATCH:${config?.projectId || 'missing'}`);
  if (!config?.apiKey || !config?.appId) fail('STAGING_TOPI_AI_CONFIG_INCOMPLETE');
  if (modelName !== 'gemini-3.8-flash') fail(`STAGING_TOPI_AI_MODEL_UNEXPECTED:${modelName}`);

  oauthToken = await firebaseCiAccessToken();
  const projectResponse = await jsonRequest(
    `https://cloudresourcemanager.googleapis.com/v1/projects/${encodeURIComponent(EXPECTED_PROJECT)}`,
    { headers: { Authorization: `Bearer ${oauthToken}`, 'X-Goog-User-Project': EXPECTED_PROJECT } },
  );
  const projectNumber = String(projectResponse.data?.projectNumber || '').trim();
  if (!projectNumber) fail('STAGING_TOPI_AI_PROJECT_NUMBER_MISSING');

  const ephemeral = await createEphemeralDebugToken({ projectNumber, appId: config.appId, oauthToken });
  debugTokenName = ephemeral.name;

  app = initializeApp(config, `tutop-ai-runtime-smoke-${Date.now()}`);
  const appCheck = initializeAppCheck(app, {
    provider: new CustomProvider({
      getToken: () => exchangeDebugToken({ projectNumber, appId: config.appId, secret: ephemeral.secret }),
    }),
    isTokenAutoRefreshEnabled: false,
  });
  const attestation = await getAppCheckToken(appCheck, true);
  if (!String(attestation?.token || '').trim()) fail('STAGING_APPCHECK_TOKEN_NOT_PROVEN');

  const ai = getAI(app, { backend: new GoogleAIBackend() });
  const model = getGenerativeModel(ai, {
    model: modelName,
    generationConfig: { temperature: 0, maxOutputTokens: 24 },
  });

  let passed = false;
  let lastError = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const result = await generateWithTimeout(model);
      const text = result?.response?.text?.() || '';
      if (!text.trim()) fail('STAGING_TOPI_AI_EMPTY_RESPONSE');
      if (!text.includes(EXPECTED_MARKER)) fail('STAGING_TOPI_AI_MARKER_MISMATCH');
      passed = true;
      break;
    } catch (error) {
      lastError = error;
      const message = safeError(error);
      if (attempt < MAX_ATTEMPTS && isPropagationError(message)) {
        console.log(`Firebase AI Logic/App Check aún propagando configuración (${attempt}/${MAX_ATTEMPTS}); reintento controlado.`);
        await sleep(RETRY_DELAY_MS);
        continue;
      }
      throw error;
    }
  }
  if (!passed) throw lastError || new Error('STAGING_TOPI_AI_RUNTIME_NOT_PROVEN');

  console.log(`✅ Firebase AI Logic runtime PASS · project=${EXPECTED_PROJECT} · model=${modelName} · app_check=true · response_marker_observed=true`);
} catch (error) {
  console.error(`DETENIDO: Firebase AI Logic runtime proof falló: ${safeError(error)}`);
  process.exitCode = 1;
} finally {
  if (app) await deleteApp(app).catch(() => {});
  if (debugTokenName && oauthToken) {
    await deleteEphemeralDebugToken({ name: debugTokenName, oauthToken }).catch((error) => {
      console.error(`DETENIDO: no se pudo revocar debug token efímero: ${safeError(error)}`);
      process.exitCode = 1;
    });
  }
}
