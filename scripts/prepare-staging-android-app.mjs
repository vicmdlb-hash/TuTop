import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { firebaseCiAccessToken } from './firebase-ci-auth.mjs';
import { assertStagingFreezeContext } from './staging-freeze-guard.mjs';
import { ensureFirebaseAiApiKeyAllowlist, ensureFirebaseAiServices } from './firebase-ai-staging-provision.mjs';

const projectId = assertStagingFreezeContext({
  allowEnv: 'TUTOP_ALLOW_ANDROID_APP_SETUP',
  allowValue: 'staging-v2',
});
const packageName = String(process.env.TUTOP_ANDROID_PACKAGE_NAME || 'mx.tutop.app').trim();
const outputPath = String(process.env.TUTOP_ANDROID_GOOGLE_SERVICES_PATH || '.tutop-staging-google-services.json').trim();
const registrationSmokeMarker = '.tutop-registration-smoke-passed';
if (packageName !== 'mx.tutop.app') throw new Error(`STAGING_FREEZE_BLOCKED:package_mismatch:${packageName}`);

const token = await firebaseCiAccessToken();
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

async function request(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { ...headers, ...(options.headers || {}) } });
  const text = await response.text();
  let data = null;
  if (text) { try { data = JSON.parse(text); } catch { data = { raw: text }; } }
  if (!response.ok) throw new Error(`${response.status} ${url}: ${text.slice(0, 1000)}`);
  return data;
}

async function operationResult(name) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const operation = await request(`https://firebase.googleapis.com/v1beta1/${name}`);
    if (operation?.done) {
      if (operation.error) throw new Error(`Android app operation failed: ${JSON.stringify(operation.error)}`);
      return operation.response;
    }
    await new Promise((resolve) => setTimeout(resolve, 1200));
  }
  throw new Error('Timeout esperando Firebase Android app operation.');
}

function runNodeScript(args, extraEnv = {}) {
  const result = spawnSync(process.execPath, args, {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: { ...process.env, ...extraEnv },
  });
  if (result.status !== 0) throw new Error(`STAGING_PREP_SUBPROCESS_FAILED:${args.join(' ')}:${result.status ?? 'signal'}`);
}

await ensureFirebaseAiServices({ projectId, token });

const parent = `projects/${projectId}`;
const listed = await request(`https://firebase.googleapis.com/v1beta1/${parent}/androidApps?pageSize=100`);
let app = (listed.apps || []).find((candidate) => candidate.packageName === packageName && candidate.state !== 'DELETED');

if (!app) {
  console.log(`Creando Firebase Android App staging: ${packageName}`);
  const operation = await request(`https://firebase.googleapis.com/v1beta1/${parent}/androidApps`, {
    method: 'POST',
    body: JSON.stringify({ displayName: 'TuTop Android Staging', packageName }),
  });
  if (!operation?.name) throw new Error('Firebase no devolvió operation.name al crear Android app.');
  app = await operationResult(operation.name);
} else {
  console.log(`Reutilizando Firebase Android App staging: ${app.appId}`);
}

if (!app?.name || !app?.appId || app.packageName !== packageName) throw new Error('Firebase Android App inválida o package mismatch.');
const config = await request(`https://firebase.googleapis.com/v1beta1/${app.name}/config`);
if (config.configFilename !== 'google-services.json' || !config.configFileContents) throw new Error('Firebase no devolvió google-services.json válido.');

const decoded = Buffer.from(config.configFileContents, 'base64').toString('utf8');
const parsed = JSON.parse(decoded);
const configuredProject = String(parsed?.project_info?.project_id || '');
const matchingClients = (parsed?.client || []).filter((client) => String(client?.client_info?.android_client_info?.package_name || '') === packageName);
const configuredPackages = (parsed?.client || []).map((client) => String(client?.client_info?.android_client_info?.package_name || '')).filter(Boolean);
if (configuredProject !== projectId) throw new Error(`google-services project mismatch: ${configuredProject}`);
if (!configuredPackages.includes(packageName)) throw new Error(`google-services package mismatch: ${configuredPackages.join(',')}`);

const androidApiKeys = new Set(
  matchingClients.flatMap((client) => (client?.api_key || []).map((item) => String(item?.current_key || '').trim())).filter(Boolean),
);
if (androidApiKeys.size === 0) throw new Error('google-services.json no contiene Firebase API key para mx.tutop.app.');
for (const apiKey of androidApiKeys) await ensureFirebaseAiApiKeyAllowlist({ projectId, token, apiKey });

fs.writeFileSync(outputPath, `${JSON.stringify(parsed, null, 2)}\n`);

// Build-91 proved that a backend smoke can pass while the actual onboarding path
// remains broken. Before any new APK is assembled, prove the app-like initial
// account shape + immediate publication, then perform the user-authorized one-shot
// beta wipe so the new physical candidate starts from clean staging state.
if (!fs.existsSync(registrationSmokeMarker)) {
  runNodeScript(['--experimental-strip-types', 'scripts/staging-app-registration-smoke.mjs']);
  runNodeScript(['scripts/reset-staging-accounts.mjs']);
  runNodeScript(['scripts/reset-staging-accounts.mjs', '--apply'], {
    TUTOP_STAGING_RESET_ACK: 'DELETE_ALL_BETA_ACCOUNTS',
  });
  fs.writeFileSync(registrationSmokeMarker, `${process.env.GITHUB_SHA || 'local'}\n`);
}

console.log(`✅ Firebase Android staging listo: ${app.appId}`);
console.log(`✅ google-services.json validado para ${projectId} / ${packageName}`);
console.log('✅ Android Firebase API key(s) verificadas para Firebase AI Logic sin imprimir valores.');
console.log('✅ Registro app-like + publicación inmediata probados; lavado beta one-shot aplicado/verificado antes del APK.');
console.log(`October gate run: ${process.env.TUTOP_VALIDATED_GATE_RUN_ID}`);
console.log(`Archivo temporal: ${outputPath}`);
