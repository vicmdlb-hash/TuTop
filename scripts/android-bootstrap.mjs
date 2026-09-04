import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const config = JSON.parse(fs.readFileSync(path.join(root, 'capacitor.config.json'), 'utf8'));
const project = JSON.parse(fs.readFileSync(path.join(root, 'config/project.json'), 'utf8'));
if (project.applicationId !== config.appId || project.applicationIdConfirmed !== true) {
  console.error('DETENIDO: el applicationId no está confirmado o no coincide con config/project.json.');
  process.exit(2);
}
if (!fs.existsSync(path.join(root, 'node_modules/@capacitor/core'))) {
  console.error('Faltan dependencias Capacitor. Ejecuta primero: npm run deps:mobile');
  process.exit(2);
}
const run = (command, args) => {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.status !== 0) process.exit(result.status || 1);
};
if (!fs.existsSync(path.join(root, 'android'))) run('npx', ['cap', 'add', 'android']);
run('npx', ['cap', 'sync', 'android']);
run('node', ['scripts/android-assets.mjs']);

const variables = path.join(root, 'android/variables.gradle');
if (fs.existsSync(variables)) {
  let source = fs.readFileSync(variables, 'utf8');
  source = source.replace(/compileSdkVersion\s*=\s*\d+/, 'compileSdkVersion = 36')
    .replace(/targetSdkVersion\s*=\s*\d+/, 'targetSdkVersion = 36')
    .replace(/minSdkVersion\s*=\s*\d+/, 'minSdkVersion = 24');
  fs.writeFileSync(variables, source);
}
console.log('Android bootstrap Spark completado con assets TuTop. Ejecuta npm run android:doctor. google-services.json NO es necesario en esta fase REST/cero inversión.');
