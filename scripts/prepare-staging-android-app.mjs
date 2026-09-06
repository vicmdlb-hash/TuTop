import fs from 'node:fs';
import { firebaseCiAccessToken } from './firebase-ci-auth.mjs';

const projectId = String(process.env.TUTOP_FIREBASE_PROJECT_ID || '').trim();
const allow = String(process.env.TUTOP_ALLOW_ANDROID_APP_SETUP || '').trim();
const packageName = String(process.env.TUTOP_ANDROID_PACKAGE_NAME || 'mx.tutop.app').trim();
const outputPath = String(process.env.TUTOP_ANDROID_GOOGLE_SERVICES_PATH || '.tutop-staging-google-services.json').trim();
const historicalProject = 'tutop-3a4f7';

function stop(message) { console.error(`DETENIDO: ${message}`); process.exit(2); }
if (!projectId) stop('falta TUTOP_FIREBASE_PROJECT_ID.');
if (allow !== 'staging-v2') stop('define TUTOP_ALLOW_ANDROID_APP_SETUP=staging-v2.');
if (projectId === historicalProject) stop(`${historicalProject} está bloqueado para Android staging.`);
if (/prod(uction)?/i.test(projectId) && process.env.TUTOP_ALLOW_PRODUCTION_FIREBASE !== '1') stop('el project ID parece producción.');
if (!/(staging|stage|beta|dev|test|sandbox)/i.test(projectId) && process.env.TUTOP_ALLOW_NONDESCRIPTIVE_STAGING_ID !== '1') stop('el project ID no parece staging/beta/dev/test.');
if (packageName !== 'mx.tutop.app') stop(`package inesperado: ${packageName}`);

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
const configuredPackages = (parsed?.client || []).map((client) => String(client?.client_info?.android_client_info?.package_name || '')).filter(Boolean);
if (configuredProject !== projectId) throw new Error(`google-services project mismatch: ${configuredProject}`);
if (!configuredPackages.includes(packageName)) throw new Error(`google-services package mismatch: ${configuredPackages.join(',')}`);

fs.writeFileSync(outputPath, `${JSON.stringify(parsed, null, 2)}\n`);
console.log(`✅ Firebase Android staging listo: ${app.appId}`);
console.log(`✅ google-services.json validado para ${projectId} / ${packageName}`);
console.log(`Archivo temporal: ${outputPath}`);
