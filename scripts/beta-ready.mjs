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
const lock = JSON.parse(read('package-lock.json') || '{}');
const cap = JSON.parse(read('capacitor.config.json') || '{}');
const project = JSON.parse(read('config/project.json') || '{}');
const app = read('src/App.tsx');
const gate = read('src/components/BackendGate.tsx');
const runtime = read('src/services/runtimeConfig.ts');
const store = read('src/store/useAppStore.ts');
const online = read('src/services/onlineBackend.ts');
const rules = read('firebase/firestore.rules');
const workflow = read('.github/workflows/android-debug-apk.yml');
const hardenedWorkflow = read('.github/workflows/one-shot-085-hardened.yml');
const qualityWorkflow = read('.github/workflows/quality.yml');
const dependabot = read('.github/dependabot.yml');
const mobileDeps = read('scripts/install-mobile-deps.mjs');
const androidBootstrap = read('scripts/android-bootstrap.mjs');
const privacy = read('public/privacy.html');
const terms = read('public/terms.html');
const assistant = read('src/lib/productAssistant.ts');

const expectedBeta = '0.9.0-beta.0';
if (pkg.version !== expectedBeta) errors.push(`Versión core npm inesperada: ${pkg.version || 'vacía'}`);
if (lock.version !== expectedBeta || lock.packages?.['']?.version !== expectedBeta) errors.push('package-lock.json no está sincronizado con la versión beta raíz');
if (pkg.type !== 'module') errors.push('package.json debe declarar type=module para evitar carga CommonJS ambigua');
if (project.currentBetaVersion !== expectedBeta) errors.push(`Versión beta Android inesperada: ${project.currentBetaVersion || 'vacía'}`);
if (pkg.version !== project.currentBetaVersion) errors.push(`Versiones raíz/Android divergentes: ${pkg.version || 'vacía'} vs ${project.currentBetaVersion || 'vacía'}`);
if (cap.appId !== 'mx.tutop.app') errors.push('Capacitor appId no es mx.tutop.app');
if (project.applicationId !== 'mx.tutop.app' || project.applicationIdConfirmed !== true) errors.push('config/project.json no confirma mx.tutop.app');
if (!app.includes('<BackendGate>')) errors.push('App no está protegida por BackendGate');
if (!runtime.includes('BUILT_IN_CONFIG') || !runtime.includes("const HISTORICAL_PROJECT_ID = 'tutop-3a4f7'")) errors.push('Falta configuración online V1 integrada para instalaciones estables');
if (!runtime.includes('V2_LEGACY_FIREBASE_BLOCKED') || !runtime.includes('V2_STAGING_PROJECT_MISMATCH')) errors.push('Runtime V2 no bloquea proyecto histórico / mismatch staging');
if (/Firebase|Firestore|projectId/i.test(gate)) {
  const consumerText = gate.replace(/CONFIGURATION_NOT_FOUND/g, '').replace(/onlineBackend/g, '').replace(/configureFromRuntime/g, '');
  if (/Firebase|Firestore|projectId/i.test(consumerText)) errors.push('BackendGate expone lenguaje técnico al usuario');
}
if (!online.includes('FirebaseRestClient')) errors.push('Backend online no usa FirebaseRestClient');
if (!rules.includes('match /wallets/{uid}')) errors.push('Rules no protegen Wallet');
if (!rules.includes('match /admins/{uid}')) errors.push('Rules no protegen administradores');
if (!workflow.includes('assembleDebug')) errors.push('Workflow estable no genera APK debug');
if (!workflow.includes('test:rules') && !workflow.includes('firestore.rules.test')) errors.push('Workflow estable no ejecuta pruebas de Firestore Rules');
if (!workflow.includes('git diff --exit-code -- package.json package-lock.json')) errors.push('Workflow Android no prueba inmutabilidad de manifests npm');
if (!mobileDeps.includes("'--no-save'") || !mobileDeps.includes("'--package-lock=false'")) errors.push('Instalación móvil debe ser efímera y no modificar package manifests');
const sdkPackages = "packages: 'platform-tools platforms;android-36 build-tools;36.0.0'";
if (!workflow.includes(sdkPackages) || !hardenedWorkflow.includes(sdkPackages)) errors.push('Workflows Android no fijan SDK 36 mediante setup-android');
if (workflow.includes('yes | sdkmanager --licenses') || hardenedWorkflow.includes('yes | sdkmanager --licenses')) errors.push('Workflow Android conserva aceptación SDK redundante y ruidosa');
if (!androidBootstrap.includes('libdatastore_shared_counter.so') || !androidBootstrap.includes('keepDebugSymbols')) errors.push('Bootstrap Android no declara la librería JNI no-strippable');
if (!qualityWorkflow.includes('npm run typecheck') || !qualityWorkflow.includes('npm run build')) errors.push('Quality workflow no cubre typecheck/build');
if (!qualityWorkflow.includes('npm run native-security:test')) errors.push('Quality workflow no valida seguridad Firebase nativa');
if (!qualityWorkflow.includes('firestore.v2.account-operations.test.mjs')) errors.push('Quality workflow no cubre reglas de operaciones de cuenta');
if (!dependabot.includes('package-ecosystem: "npm"') || !dependabot.includes('package-ecosystem: "github-actions"')) errors.push('Dependabot no cubre npm + GitHub Actions');
if (!privacy.includes('no se verifica por SMS') || !privacy.includes('no se usan Cloud Storage, Cloud Functions')) errors.push('Aviso de privacidad no refleja correctamente las limitaciones Spark/SMS de la beta');
if (!terms.includes('alcohol') || !terms.includes('vapeadores') || !terms.includes('medicamentos sujetos a receta')) errors.push('Reglas públicas no enumeran categorías sensibles bloqueadas en la beta');
for (const marker of ['clonazepam', 'vendo\\s+(?:mi\\s+)?cuenta', 'respuestas\\s+del\\s+examen']) { if (!assistant.includes(marker)) errors.push(`Asistente de publicación perdió control sensible: ${marker}`); }

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

notes.push(`Core npm/base ${pkg.version || 'desconocida'} · release Android beta ${project.currentBetaVersion || 'desconocida'}`);
notes.push(`Versionado raíz/lock/Android sincronizado en ${expectedBeta}`);
notes.push(`Application ID ${cap.appId || 'desconocido'}`);
notes.push('Backend beta: Firebase REST + Firestore Security Rules');
notes.push('Distribución inmediata: APK debug por GitHub Actions, sin Play Console');

for (const note of notes) console.log(`OK   ${note}`);
for (const error of errors) console.error(`FAIL ${error}`);
console.log(errors.length ? `\nBeta readiness FAIL · ${errors.length} problema(s).` : '\n✅ TuTop beta readiness PASS.');
process.exit(errors.length ? 1 : 0);
