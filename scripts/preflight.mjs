import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const errors = [];
const warnings = [];
const exists = (p) => fs.existsSync(path.join(root, p));

for (const required of [
  'package.json', 'package-lock.json', 'src/App.tsx', 'src/services/contracts.ts', 'src/services/firebaseRest.ts',
  'src/services/onlineBackend.ts', 'src/services/runtimeConfig.ts', 'capacitor.config.json', '.env.example',
  'firebase/firestore.rules', 'firebase/firestore.indexes.json', 'firebase/SCHEMA.md', 'firebase.json',
  'docs/design-reference-approved.png', 'assets/branding/tutop-app-icon-1024.png',
  'public/privacy.html', 'public/terms.html', 'preview/MiTuTop_Admin_Online.html',
]) {
  if (!exists(required)) errors.push(`Falta ${required}`);
}

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
if (!pkg.scripts?.build) errors.push('package.json no define npm run build');
if (!pkg.scripts?.check) errors.push('package.json no define npm run check');
if (!pkg.scripts?.['firebase:deploy:spark']) errors.push('package.json no define firebase:deploy:spark');
if (lock.version !== pkg.version || lock.packages?.['']?.version !== pkg.version) errors.push('package.json y package-lock.json tienen versiones distintas.');

const activeFirebase = JSON.parse(fs.readFileSync(path.join(root, 'firebase.json'), 'utf8'));
if (activeFirebase.functions || activeFirebase.storage) errors.push('firebase.json activo debe permanecer Spark-only hasta que el usuario decida habilitar billing.');

const projectConfig = exists('config/project.json') ? JSON.parse(fs.readFileSync(path.join(root, 'config/project.json'), 'utf8')) : null;
if (!projectConfig?.applicationIdConfirmed) errors.push('Falta confirmación persistente del applicationId en config/project.json.');
if (!exists('android')) warnings.push(`Aún no existe /android. applicationId confirmado: ${projectConfig?.applicationId || 'desconocido'}. El APK local no necesita Google Play, pero sí Android SDK/licencias en la máquina de build.`);

if (exists('node_modules') && (!exists('node_modules/react/package.json') || !exists('node_modules/@types/react/index.d.ts'))) {
  warnings.push('node_modules existe pero parece incompleto. Antes del build: borrar node_modules y ejecutar npm ci limpio.');
}
if (exists('android/app/build.gradle')) {
  const gradle = fs.readFileSync(path.join(root, 'android/app/build.gradle'), 'utf8');
  if (!/targetSdk(?:Version)?\s*=?\s*36/.test(gradle)) warnings.push('No se detectó targetSdk 36 en android/app/build.gradle');
}

console.log('TuTop preflight · cero inversión');
console.log('================================');
for (const warning of warnings) console.log(`WARN  ${warning}`);
for (const error of errors) console.log(`ERROR ${error}`);
console.log(errors.length ? '\nPreflight falló.' : '\nPreflight base OK.');
process.exit(errors.length ? 1 : 0);
