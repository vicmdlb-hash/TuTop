import fs from 'node:fs';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAI, getGenerativeModel, GoogleAIBackend } from 'firebase/ai';

const EXPECTED_PROJECT = 'tutop-beta-vicmdlb-1356585881';
const EXPECTED_MARKER = 'TUTOP_AI_RUNTIME_OK_091';
const MAX_ATTEMPTS = 8;
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
    .replace(/[A-Za-z0-9_-]{120,}/g, '[redacted-long-token]')
    .slice(0, 1200);
}

function isPropagationError(message) {
  return /api-not-enabled|API_KEY_SERVICE_BLOCKED|SERVICE_DISABLED|service identity|PERMISSION_DENIED|temporarily unavailable|503/i.test(message);
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
try {
  if (!fs.existsSync(configPath)) fail(`STAGING_TOPI_AI_CONFIG_MISSING:${configPath}`);
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  if (config?.projectId !== EXPECTED_PROJECT) fail(`STAGING_TOPI_AI_PROJECT_MISMATCH:${config?.projectId || 'missing'}`);
  if (!config?.apiKey || !config?.appId) fail('STAGING_TOPI_AI_CONFIG_INCOMPLETE');
  if (modelName !== 'gemini-3.8-flash') fail(`STAGING_TOPI_AI_MODEL_UNEXPECTED:${modelName}`);

  app = initializeApp(config, `tutop-ai-runtime-smoke-${Date.now()}`);
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
        console.log(`Firebase AI Logic aún propagando configuración (${attempt}/${MAX_ATTEMPTS}); reintento controlado.`);
        await sleep(RETRY_DELAY_MS);
        continue;
      }
      throw error;
    }
  }
  if (!passed) throw lastError || new Error('STAGING_TOPI_AI_RUNTIME_NOT_PROVEN');

  console.log(`✅ Firebase AI Logic runtime PASS · project=${EXPECTED_PROJECT} · model=${modelName} · response_marker_observed=true`);
} catch (error) {
  console.error(`DETENIDO: Firebase AI Logic runtime proof falló: ${safeError(error)}`);
  process.exitCode = 1;
} finally {
  if (app) await deleteApp(app).catch(() => {});
}
