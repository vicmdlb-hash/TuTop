import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const errors = [];
const notes = [];

function read(relative) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) { errors.push(`Falta ${relative}`); return ''; }
  return fs.readFileSync(file, 'utf8');
}

const pkg = JSON.parse(read('package.json') || '{}');
const cap = JSON.parse(read('capacitor.config.json') || '{}');
const project = JSON.parse(read('config/project.json') || '{}');
const app = read('src/App.tsx');
const gate = read('src/components/BackendGate.tsx');
const runtime = read('src/services/runtimeConfig.ts');
const store = read('src/store/useAppStore.ts');
const online = read('src/services/onlineBackend.ts');
const rules = read('firebase/firestore.rules');
const workflow = read('.github/workflows/android-debug-apk.yml');
const qualityWorkflow = read('.github/workflows/quality.yml');
const dependabot = read('.github/dependabot.yml');
const privacy = read('public/privacy.html');
const terms = read('public/terms.html');
const assistant = read('src/lib/productAssistant.ts');

if (cap.appId !== 'mx.tutop.app') errors.push('Capacitor appId no es mx.tutop.app');
if (project.applicationId !== 'mx.tutop.app' || project.applicationIdConfirmed !== true) errors.push('config/project.json no confirma mx.tutop.app');
if (!app.includes('<BackendGate>')) errors.push('App no está protegida por BackendGate');
if (!runtime.includes('BUILT_IN_CONFIG') || !runtime.includes("projectId: 'tutop-3a4f7'")) errors.push('Falta configuración online integrada para instalaciones nuevas');
if (/Firebase|Firestore|projectId/i.test(gate)) {
  const consumerText = gate.replace(/CONFIGURATION_NOT_FOUND/g, '').replace(/onlineBackend/g, '').replace(/configureFromRuntime/g, '');
  if (/Firebase|Firestore|projectId/i.test(consumerText)) errors.push('BackendGate expone lenguaje técnico al usuario');
}
if (!online.includes('FirebaseRestClient')) errors.push('Backend online no usa FirebaseRestClient');
if (!rules.includes('match /wallets/{uid}')) errors.push('Rules no protegen Wallet');
if (!rules.includes('match /admins/{uid}')) errors.push('Rules no protegen administradores');
if (!workflow.includes('assembleDebug')) errors.push('Workflow no genera APK debug');
if (!workflow.includes('test:rules') && !workflow.includes('firestore.rules.test')) errors.push('Workflow no ejecuta pruebas de Firestore Rules');
if (!qualityWorkflow.includes('npm run typecheck') || !qualityWorkflow.includes('npm run build')) errors.push('Quality workflow no cubre typecheck/build');
if (!dependabot.includes('package-ecosystem: "npm"') || !dependabot.includes('package-ecosystem: "github-actions"')) errors.push('Dependabot no cubre npm + GitHub Actions');
if (!privacy.includes('no se verifica por SMS') || !privacy.includes('no se usan Cloud Storage, Cloud Functions')) errors.push('Aviso de privacidad no refleja correctamente las limitaciones Spark/SMS de la beta');
if (!terms.includes('alcohol') || !terms.includes('vapeadores') || !terms.includes('medicamentos sujetos a receta')) errors.push('Reglas públicas no enumeran categorías sensibles bloqueadas en la beta');
for (const marker of ['clonazepam', 'vendo\\s+(?:mi\\s+)?cuenta', 'respuestas\\s+del\\s+examen']) { if (!assistant.includes(marker)) errors.push(`Asistente de publicación perdió control sensible: ${marker}`); }

// Active beta must not ship the old seeded local marketplace.
const forbiddenSeedMarkers = ['initialProducts', 'Ana M.', 'Carlos R.', 'Burrito de Milanesa'];
for (const marker of forbiddenSeedMarkers) {
  if (store.includes(marker) || online.includes(marker)) errors.push(`Dataset ficticio activo detectado: ${marker}`);
}

const activeUiFiles = [
  'src/components/ErrorBoundary.tsx',
  'src/components/PreviewModal.tsx',
  'src/components/Chatbot.tsx',
  'src/components/Feed.tsx',
  'src/components/Profile.tsx',
];
for (const file of activeUiFiles) {
  const text = read(file);
  if (/modo demo|datos demo|demo local/i.test(text)) errors.push(`Texto de demo visible en ${file}`);
}

notes.push(`Versión ${pkg.version || 'desconocida'}`);
notes.push(`Application ID ${cap.appId || 'desconocido'}`);
notes.push('Backend beta: Firebase REST + Firestore Security Rules');
notes.push('Distribución inmediata: APK debug por GitHub Actions, sin Play Console');

for (const note of notes) console.log(`OK   ${note}`);
for (const error of errors) console.error(`FAIL ${error}`);
console.log(errors.length ? `\nBeta readiness FAIL · ${errors.length} problema(s).` : '\n✅ TuTop beta readiness PASS.');
process.exit(errors.length ? 1 : 0);
