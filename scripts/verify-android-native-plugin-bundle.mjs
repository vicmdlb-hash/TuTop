import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const registryPath = path.join(root, 'android/app/src/main/assets/capacitor.plugins.json');
const settingsCandidates = [
  path.join(root, 'android/capacitor.settings.gradle'),
  path.join(root, 'android/settings.gradle'),
];

const required = [
  '@capacitor/camera',
  '@capacitor/filesystem',
  '@capacitor/geolocation',
  '@capacitor-firebase/messaging',
  '@capacitor-firebase/app-check',
];

function stop(message) {
  console.error(`DETENIDO: ${message}`);
  process.exit(2);
}

if (!fs.existsSync(registryPath)) stop('falta android/app/src/main/assets/capacitor.plugins.json después de cap sync.');
let registry;
try {
  registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
} catch {
  stop('capacitor.plugins.json no es JSON válido.');
}
if (!Array.isArray(registry)) stop('capacitor.plugins.json debe ser una lista.');
if (registry.length === 0) stop('Capacitor generó una lista de plugins vacía; cámara/galería/ubicación no llegarían al APK.');
const registryText = JSON.stringify(registry);
for (const plugin of required) {
  if (!registryText.includes(plugin)) stop(`plugin nativo no registrado por Capacitor: ${plugin}`);
}

const settingsText = settingsCandidates
  .filter((file) => fs.existsSync(file))
  .map((file) => fs.readFileSync(file, 'utf8'))
  .join('\n');
if (!settingsText) stop('no encontré settings Gradle generados por Capacitor.');
for (const plugin of required) {
  const modulePath = `node_modules/${plugin}/android`;
  if (!settingsText.includes(modulePath)) stop(`módulo Android no enlazado en Gradle: ${plugin}`);
}

const classpaths = registry
  .map((entry) => String(entry?.classpath || '').trim())
  .filter(Boolean);
if (classpaths.length < required.length) stop('registro Capacitor incompleto: faltan classpaths nativos.');

console.log(`✅ Capacitor Android: ${required.length}/${required.length} plugins nativos enlazados y registrados.`);
console.log(`   ${required.join(' · ')}`);
