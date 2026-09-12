import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const errors = [];
const warnings = [];
const required = [
  'firebase.json',
  'firebase/firestore.rules',
  'firebase/firestore.indexes.json',
  'src/services/firebaseRest.ts',
  'src/services/runtimeConfig.ts',
  'config/project.json',
  'docs/RUNTIME_FREEZE_CANDIDATE_0.9.json',
  'public/privacy.html',
  'public/delete-account.html',
];
for (const file of required) if (!fs.existsSync(path.join(root, file))) errors.push(`Falta ${file}`);

const active = JSON.parse(fs.readFileSync(path.join(root, 'firebase.json'), 'utf8'));
const project = JSON.parse(fs.readFileSync(path.join(root, 'config/project.json'), 'utf8'));
const freeze = JSON.parse(fs.readFileSync(path.join(root, 'docs/RUNTIME_FREEZE_CANDIDATE_0.9.json'), 'utf8'));
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

if (active.functions) errors.push('firebase.json activo no debe desplegar Functions en modo cero inversión.');
if (active.storage) errors.push('firebase.json activo no debe desplegar Storage en modo cero inversión.');
if (!active.firestore?.rules || !active.firestore?.indexes) errors.push('Firestore rules/indexes no están configurados.');
if (project.zeroInvestmentMode !== true || project.billingAllowed !== false || project.productionPublishingAllowed !== false) {
  errors.push('La política del proyecto dejó de ser zero-investment / no-production.');
}
if (freeze.status !== 'runtime_freeze_candidate' || freeze.runtime_validated !== false || freeze.feature_freeze !== true) {
  errors.push('Runtime Freeze manifest no está en estado PREPARED / NOT VALIDATED esperado.');
}
if (pkg.scripts?.['firebase:link'] !== 'node scripts/freeze-blocked-command.mjs firebase:link') {
  errors.push('firebase:link debe permanecer bloqueado durante Runtime Freeze; staging usa --project explícito.');
}
if (pkg.scripts?.['firebase:deploy:spark'] !== 'node scripts/freeze-blocked-command.mjs firebase:deploy:spark') {
  errors.push('firebase:deploy:spark debe permanecer bloqueado durante Runtime Freeze.');
}
if (pkg.scripts?.['firebase:deploy:staging'] !== 'node scripts/deploy-firebase-staging.mjs') {
  errors.push('La ruta canónica firebase:deploy:staging cambió inesperadamente.');
}

const configVars = ['VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_PROJECT_ID', 'VITE_FIREBASE_APP_ID'];
const envCandidates = ['.env.local', '.env'];
let envText = '';
for (const file of envCandidates) if (fs.existsSync(file)) envText += `\n${fs.readFileSync(file, 'utf8')}`;
if (!envText) warnings.push('No existe .env/.env.local local; es válido: el staging V2 genera config temporal sólo después del gate exact-SHA.');
else for (const key of configVars) if (!new RegExp(`^${key}=.+$`, 'm').test(envText)) warnings.push(`Falta ${key} en el env local.`);

if (fs.existsSync(path.join(root, '.firebaserc'))) {
  warnings.push('.firebaserc es sólo metadata local/legacy durante el freeze; NO autoriza V2 ni sustituye el project ID exacto de staging.');
}
if (!fs.existsSync(path.join(root, 'node_modules/firebase-tools/package.json'))) {
  warnings.push('firebase-tools local no está instalado; los gates usan versiones efímeras/fijadas cuando corresponde.');
}

const indexes = JSON.parse(fs.readFileSync(path.join(root, 'firebase/firestore.indexes.json'), 'utf8'));
const indexText = JSON.stringify(indexes);
if (!indexText.includes('participants') || !indexText.includes('updated_at')) warnings.push('No se detectó el índice compuesto de chats por participants/updated_at.');
if (!indexText.includes('wallet_transactions') || !indexText.includes('created_at')) warnings.push('No se detectó el índice compuesto de wallet_transactions.');

errors.forEach((item) => console.error(`ERROR ${item}`));
warnings.forEach((item) => console.log(`WARN ${item}`));
console.log(errors.length
  ? 'Firebase doctor FAIL.'
  : '✅ Firebase doctor PREPARED · Runtime Freeze Candidate / NOT VALIDATED; .firebaserc no es autoridad de staging.');
process.exit(errors.length ? 1 : 0);
