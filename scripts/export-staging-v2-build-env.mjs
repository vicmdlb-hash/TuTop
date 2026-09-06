import fs from 'node:fs';

const configPath = String(process.env.TUTOP_STAGING_WEB_CONFIG_PATH || '.tutop-staging-web-config.json').trim();
const githubEnv = String(process.env.GITHUB_ENV || '').trim();
const expectedProject = 'tutop-beta-vicmdlb-1356585881';
const historicalProject = 'tutop-3a4f7';
const version = String(process.env.TUTOP_BETA_VERSION || '0.8.5-beta.0').trim();

function stop(message) { console.error(`DETENIDO: ${message}`); process.exit(2); }
if (!githubEnv) stop('GITHUB_ENV no está disponible; este export sólo debe correr dentro del build CI.');
if (!fs.existsSync(configPath)) stop(`falta config web staging: ${configPath}`);
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
if (!config.apiKey || !config.projectId || !config.appId) stop('config web Firebase incompleta.');
if (config.projectId === historicalProject) stop('V2 build no puede apuntar al Firebase histórico.');
if (config.projectId !== expectedProject) stop(`V2 staging project mismatch: ${config.projectId}`);
if (!/^0\.8\.5-beta\./.test(version)) stop(`versión beta inesperada: ${version}`);

// apiKey/appId are client configuration rather than private server credentials, but
// masking them keeps CI logs minimal and prevents accidental copy/paste exposure.
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
];
fs.appendFileSync(githubEnv, `${lines.join('\n')}\n`);
console.log(`✅ Ambiente V2 staging exportado para ${expectedProject} · ${version}.`);
console.log('Configuración cliente sensible a copia queda enmascarada en GitHub Actions.');
