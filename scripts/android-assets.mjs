import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const required = [
  ['assets/icon-only.png', 1024, 1024],
  ['assets/icon-foreground.png', 1024, 1024],
  ['assets/icon-background.png', 1024, 1024],
  ['assets/splash.png', 2732, 2732],
  ['assets/splash-dark.png', 2732, 2732],
];

const missing = required.filter(([relative]) => !fs.existsSync(path.join(root, relative)));
if (missing.length) {
  console.error('Faltan assets canónicos para Android:');
  for (const [relative] of missing) console.error(`- ${relative}`);
  process.exit(2);
}
if (!fs.existsSync(path.join(root, 'android'))) {
  console.error('No existe /android. Ejecuta primero npm run android:bootstrap (o npx cap add android).');
  process.exit(2);
}
if (!fs.existsSync(path.join(root, 'node_modules/@capacitor/assets'))) {
  console.error('Falta @capacitor/assets. Ejecuta npm run deps:mobile.');
  process.exit(2);
}

const args = [
  '@capacitor/assets', 'generate', '--android',
  '--iconBackgroundColor', '#050A13',
  '--iconBackgroundColorDark', '#050A13',
  '--splashBackgroundColor', '#050A13',
  '--splashBackgroundColorDark', '#050A13',
];
const result = spawnSync('npx', args, {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
if (result.status !== 0) process.exit(result.status || 1);
console.log('Assets Android TuTop generados desde /assets. Revisa visualmente icono adaptativo y splash en emulador/dispositivo.');
