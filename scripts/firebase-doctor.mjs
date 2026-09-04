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
  'public/privacy.html',
  'public/delete-account.html',
];
for (const file of required) if (!fs.existsSync(path.join(root, file))) errors.push(`Falta ${file}`);

const active = JSON.parse(fs.readFileSync(path.join(root, 'firebase.json'), 'utf8'));
if (active.functions) errors.push('firebase.json activo no debe desplegar Functions en modo cero inversión.');
if (active.storage) errors.push('firebase.json activo no debe desplegar Storage en modo cero inversión.');
if (!active.firestore?.rules || !active.firestore?.indexes) errors.push('Firestore rules/indexes no están configurados.');

const configVars = ['VITE_FIREBASE_API_KEY','VITE_FIREBASE_PROJECT_ID','VITE_FIREBASE_APP_ID'];
const envCandidates = ['.env.local', '.env'];
let envText = '';
for (const file of envCandidates) if (fs.existsSync(file)) envText += `\n${fs.readFileSync(file, 'utf8')}`;
if (!envText) warnings.push('No existe .env/.env.local real; es válido porque TuTop también acepta firebaseConfig en runtime.');
else for (const key of configVars) if (!new RegExp(`^${key}=.+$`, 'm').test(envText)) warnings.push(`Falta ${key} en el env local.`);

if (!fs.existsSync(path.join(root, '.firebaserc'))) warnings.push('No hay .firebaserc: todavía no se ha vinculado el proyecto Firebase real para deploy por CLI.');
if (!fs.existsSync(path.join(root, 'node_modules/firebase-tools/package.json'))) warnings.push('firebase-tools local no está instalado; GitHub/una instalación limpia podrá ejecutar emuladores y deploy.');

const indexes = JSON.parse(fs.readFileSync(path.join(root, 'firebase/firestore.indexes.json'), 'utf8'));
const indexText = JSON.stringify(indexes);
if (!indexText.includes('participants') || !indexText.includes('updated_at')) warnings.push('No se detectó el índice compuesto de chats por participantes/updated_at.');
if (!indexText.includes('wallet_transactions') || !indexText.includes('created_at')) warnings.push('No se detectó el índice compuesto de wallet_transactions.');

errors.forEach((item) => console.error(`ERROR ${item}`));
warnings.forEach((item) => console.log(`WARN ${item}`));
console.log(errors.length ? 'Firebase doctor FAIL.' : 'Firebase doctor Spark OK.');
process.exit(errors.length ? 1 : 0);
