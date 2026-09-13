import fs from 'node:fs';

const configPath = String(process.env.TUTOP_STAGING_WEB_CONFIG_PATH || '.tutop-staging-web-config.json').trim();
const githubEnv = String(process.env.GITHUB_ENV || '').trim();
const expectedProject = 'tutop-beta-vicmdlb-1356585881';
const historicalProject = 'tutop-3a4f7';
const version = String(process.env.TUTOP_BETA_VERSION || '0.9.1-beta.0').trim();

function stop(message) { console.error(`DETENIDO: ${message}`); process.exit(2); }
if (!githubEnv) stop('GITHUB_ENV no está disponible; este export sólo debe correr dentro del build CI.');

const cutoverFlags = [
  'VITE_TUTOP_V2_REVIEWS_LAZY_CUTOVER',
  'VITE_TUTOP_V2_WALLET_LAZY_CUTOVER',
  'VITE_TUTOP_V2_FAVORITES_VISIBLE_CUTOVER',
];
for (const name of cutoverFlags) {
  if (String(process.env[name] || 'false').trim().toLowerCase() === 'true') {
    stop(`${name}=true no está autorizado para el APK baseline del Runtime Freeze; completar primero Physical QA A+B con los tres cutovers en false.`);
  }
}

if (!fs.existsSync(configPath)) stop(`falta config web staging: ${configPath}`);
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
if (!config.apiKey || !config.projectId || !config.appId) stop('config web Firebase incompleta.');
if (config.projectId === historicalProject) stop('V2 build no puede apuntar al Firebase histórico.');
if (config.projectId !== expectedProject) stop(`V2 staging project mismatch: ${config.projectId}`);
if (!/^0\.9\.(?:1|2)-beta\.\d+$/.test(version)) stop(`versión beta inesperada: ${version}`);

const appCheckRequired = String(process.env.TUTOP_AI_APP_CHECK_REQUIRED || 'true').trim().toLowerCase() !== 'false';
const is092 = /^0\.9\.2-beta\./.test(version);
if (!appCheckRequired && !is092) stop('la excepción App Check del cliente sólo está autorizada para Physical QA 0.9.2.');

for (const value of [config.apiKey, config.appId]) {
  const clean = String(value || '').trim();
  if (clean) process.stdout.write(`::add-mask::${clean}\n`);
}

const lines = [
  `VITE_FIREBASE_API_KEY=${config.apiKey}`,
  `VITE_FIREBASE_AUTH_DOMAIN=${config.authDomain || `${expectedProject}.firebaseapp.com`}`,
  `VITE_FIREBASE_PROJECT_ID=${config.projectId}`,
  `VITE_FIREBASE_APP_ID=${config.appId}`,
  'VITE_TUTOP_SCHEMA_V2=true',
  'VITE_TUTOP_ENVIRONMENT=staging',
  `VITE_TUTOP_APP_VERSION=${version}`,
  'VITE_TUTOP_TOPI_FIREBASE_AI_ENABLED=true',
  'VITE_TUTOP_TOPI_MODEL=gemini-3.8-flash',
  `VITE_TUTOP_AI_APP_CHECK_REQUIRED=${appCheckRequired ? 'true' : 'false'}`,
];
fs.appendFileSync(githubEnv, `${lines.join('\n')}\n`);
console.log(`✅ Ambiente V2 staging exportado para ${expectedProject} · ${version}.`);
console.log(`Topi Firebase AI Logic habilitado; App Check requerido por el cliente=${appCheckRequired}. No se exporta API key de proveedor.`);
console.log('Baseline Physical QA: reviews/wallet/favorites cutovers permanecen false hasta completar Device A+B.');
console.log('Configuración cliente sensible a copia queda enmascarada en GitHub Actions.');
