import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const config = JSON.parse(fs.readFileSync(path.join(root, 'capacitor.config.json'), 'utf8'));
const project = JSON.parse(fs.readFileSync(path.join(root, 'config/project.json'), 'utf8'));
const v2 = String(process.env.VITE_TUTOP_SCHEMA_V2 || '').toLowerCase() === 'true';
const environment = String(process.env.VITE_TUTOP_ENVIRONMENT || '').toLowerCase();
const expectedStagingProject = 'tutop-beta-vicmdlb-1356585881';
const historicalProject = 'tutop-3a4f7';
const googleServicesSource = path.resolve(root, process.env.TUTOP_ANDROID_GOOGLE_SERVICES_PATH || '.tutop-staging-google-services.json');

function stop(message) {
  console.error(`DETENIDO: ${message}`);
  process.exit(2);
}

if (project.applicationId !== config.appId || project.applicationIdConfirmed !== true) {
  stop('el applicationId no está confirmado o no coincide con config/project.json.');
}
if (!fs.existsSync(path.join(root, 'node_modules/@capacitor/core'))) {
  stop('faltan dependencias Capacitor. Ejecuta primero: npm run deps:mobile');
}
if (v2) {
  for (const dependency of ['@capacitor-firebase/messaging', '@capacitor-firebase/app-check', 'firebase']) {
    if (!fs.existsSync(path.join(root, 'node_modules', dependency))) stop(`falta dependencia Android V2: ${dependency}`);
  }
  if (!fs.existsSync(googleServicesSource)) stop(`V2 Android requiere google-services.json validado en ${googleServicesSource}`);
  const googleServices = JSON.parse(fs.readFileSync(googleServicesSource, 'utf8'));
  const firebaseProjectId = String(googleServices?.project_info?.project_id || '');
  const packages = (googleServices?.client || []).map((client) => String(client?.client_info?.android_client_info?.package_name || '')).filter(Boolean);
  if (firebaseProjectId === historicalProject) stop('V2 Android no puede usar el proyecto Firebase histórico.');
  if (environment === 'staging' && firebaseProjectId !== expectedStagingProject) stop(`Firebase staging mismatch: ${firebaseProjectId}`);
  if (!packages.includes(config.appId)) stop(`google-services.json no contiene ${config.appId}.`);
}

const run = (command, args) => {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.status !== 0) process.exit(result.status || 1);
};
if (!fs.existsSync(path.join(root, 'android'))) run('npx', ['cap', 'add', 'android']);
run('npx', ['cap', 'sync', 'android']);
run('node', ['scripts/android-assets.mjs']);
run('node', ['scripts/android-native-capabilities.mjs']);

const variables = path.join(root, 'android/variables.gradle');
if (fs.existsSync(variables)) {
  let source = fs.readFileSync(variables, 'utf8');
  source = source.replace(/compileSdkVersion\s*=\s*\d+/, 'compileSdkVersion = 36')
    .replace(/targetSdkVersion\s*=\s*\d+/, 'targetSdkVersion = 36')
    .replace(/minSdkVersion\s*=\s*\d+/, 'minSdkVersion = 24');
  fs.writeFileSync(variables, source);
}

const appGradle = path.join(root, 'android/app/build.gradle');
if (fs.existsSync(appGradle)) {
  let source = fs.readFileSync(appGradle, 'utf8');
  if (!source.includes('libdatastore_shared_counter.so')) {
    const marker = 'android {';
    if (!source.includes(marker)) stop('no pude localizar android { en android/app/build.gradle.');
    source = source.replace(
      marker,
      `${marker}\n    packaging {\n        jniLibs {\n            keepDebugSymbols += ['**/libdatastore_shared_counter.so']\n        }\n    }`,
    );
    fs.writeFileSync(appGradle, source);
  }
}

if (v2) {
  const destination = path.join(root, 'android/app/google-services.json');
  fs.copyFileSync(googleServicesSource, destination);

  const manifestPath = path.join(root, 'android/app/src/main/AndroidManifest.xml');
  if (fs.existsSync(manifestPath)) {
    let manifest = fs.readFileSync(manifestPath, 'utf8');
    if (!manifest.includes('firebase_messaging_auto_init_enabled')) {
      const marker = '<application';
      const start = manifest.indexOf(marker);
      const close = start >= 0 ? manifest.indexOf('>', start) : -1;
      if (close < 0) stop('no pude localizar <application> en AndroidManifest.xml.');
      const metadata = `\n        <meta-data android:name="firebase_messaging_auto_init_enabled" android:value="false" />\n        <meta-data android:name="firebase_analytics_collection_enabled" android:value="false" />`;
      manifest = `${manifest.slice(0, close + 1)}${metadata}${manifest.slice(close + 1)}`;
      fs.writeFileSync(manifestPath, manifest);
    }
  }
  console.log(`Firebase Android V2 validado y copiado: ${expectedStagingProject} / ${config.appId}`);
}

console.log('Android bootstrap preparado. No se generó APK en este paso.');
