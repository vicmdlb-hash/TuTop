import fs from 'node:fs';

const EXPECTED_PROJECT = 'tutop-beta-vicmdlb-1356585881';
const input = String(process.env.TUTOP_STAGING_WEB_CONFIG_PATH || '.tutop-staging-web-config.json').trim();
const output = String(process.env.TUTOP_HOSTING_WEB_CONFIG_OUTPUT || 'public/tutop-web-config.json').trim();

if (!fs.existsSync(input)) throw new Error('CANDIDATE120_HOSTING_FIREBASE_CONFIG_MISSING');
const source = JSON.parse(fs.readFileSync(input, 'utf8'));
if (source.projectId !== EXPECTED_PROJECT) throw new Error('CANDIDATE120_HOSTING_PROJECT_MISMATCH');
for (const key of ['apiKey', 'projectId', 'appId']) {
  if (!String(source[key] || '').trim()) throw new Error(`CANDIDATE120_HOSTING_CONFIG_MISSING_${key}`);
}

const publicConfig = {
  apiKey: String(source.apiKey),
  authDomain: String(source.authDomain || `${EXPECTED_PROJECT}.firebaseapp.com`),
  projectId: EXPECTED_PROJECT,
  appId: String(source.appId),
  environment: 'staging',
};

fs.writeFileSync(output, JSON.stringify(publicConfig, null, 2) + '\n');
console.log(`PASS Candidate120 Hosting runtime config prepared for ${EXPECTED_PROJECT}; no session credentials emitted.`);
