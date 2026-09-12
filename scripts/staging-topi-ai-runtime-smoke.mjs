import fs from 'node:fs';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAI, getGenerativeModel, GoogleAIBackend } from 'firebase/ai';

const EXPECTED_PROJECT = 'tutop-beta-vicmdlb-1356585881';
const EXPECTED_MARKER = 'TUTOP_AI_RUNTIME_OK_091';
const configPath = String(process.env.TUTOP_STAGING_WEB_CONFIG_PATH || '.tutop-staging-web-config.json').trim();
const modelName = String(process.env.TUTOP_TOPI_AI_MODEL || 'gemini-3.8-flash').trim();

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

  const request = model.generateContent(
    `Health check de TuTop staging. Responde solamente con ${EXPECTED_MARKER}. No incluyas datos adicionales.`
  );
  const timeout = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('STAGING_TOPI_AI_TIMEOUT')), 30_000);
  });
  const result = await Promise.race([request, timeout]);
  const text = result?.response?.text?.() || '';
  if (!text.trim()) fail('STAGING_TOPI_AI_EMPTY_RESPONSE');
  if (!text.includes(EXPECTED_MARKER)) fail('STAGING_TOPI_AI_MARKER_MISMATCH');

  console.log(`✅ Firebase AI Logic runtime PASS · project=${EXPECTED_PROJECT} · model=${modelName} · response_marker_observed=true`);
} catch (error) {
  console.error(`DETENIDO: Firebase AI Logic runtime proof falló: ${safeError(error)}`);
  process.exitCode = 1;
} finally {
  if (app) await deleteApp(app).catch(() => {});
}
