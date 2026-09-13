import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const require = createRequire(import.meta.url);

function stop(message) {
  console.error(`DETENIDO: ${message}`);
  process.exit(2);
}

let sharp;
try {
  sharp = require('sharp');
} catch {
  stop('Falta sharp, dependencia transitiva de @capacitor/assets. Ejecuta npm run deps:mobile.');
}

const brand = {
  icon: path.join(root, 'assets/branding/tutop-app-icon.svg'),
  foreground: path.join(root, 'assets/branding/tutop-adaptive-foreground.svg'),
  splash: path.join(root, 'assets/branding/tutop-splash-091.svg'),
};
for (const source of Object.values(brand)) {
  if (!fs.existsSync(source)) stop(`Falta fuente de branding 0.9.1: ${path.relative(root, source)}`);
}

async function renderBrandAssets() {
  const backgroundSvg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#7C4DFF"/><stop offset=".48" stop-color="#4B2EDB"/><stop offset="1" stop-color="#7C4DFF"/></linearGradient></defs><rect width="1024" height="1024" fill="url(#g)"/></svg>');
  const splashSource = fs.readFileSync(brand.splash, 'utf8');
  const splashDarkSource = splashSource
    .replaceAll('#F5F6FB', '#0F0F14')
    .replaceAll('#211A47', '#F8F7FF')
    .replaceAll('#EEDFFF', '#241B3D')
    .replaceAll('#4B2EDB', '#8B5CFF');

  await sharp(brand.icon, { density: 240 }).resize(1024, 1024).png().toFile(path.join(root, 'assets/icon-only.png'));
  await sharp(brand.foreground, { density: 240 }).resize(1024, 1024).png().toFile(path.join(root, 'assets/icon-foreground.png'));
  await sharp(backgroundSvg, { density: 240 }).resize(1024, 1024).png().toFile(path.join(root, 'assets/icon-background.png'));
  await sharp(Buffer.from(splashSource), { density: 180 }).resize(2732, 2732).png().toFile(path.join(root, 'assets/splash.png'));
  await sharp(Buffer.from(splashDarkSource), { density: 180 }).resize(2732, 2732).png().toFile(path.join(root, 'assets/splash-dark.png'));
}

await renderBrandAssets();

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

for (const [relative, width, height] of required) {
  const metadata = await sharp(path.join(root, relative)).metadata();
  if (metadata.width !== width || metadata.height !== height) stop(`${relative} debe medir exactamente ${width}x${height}.`);
}

const args = [
  '@capacitor/assets', 'generate', '--android',
  '--iconBackgroundColor', '#4B2EDB',
  '--iconBackgroundColorDark', '#4B2EDB',
  '--splashBackgroundColor', '#F5F6FB',
  '--splashBackgroundColorDark', '#0F0F14',
];
const result = spawnSync('npx', args, {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
if (result.status !== 0) process.exit(result.status || 1);
console.log('✅ Branding Android 0.9.1 generado: icono TuTop morado + splash Topi claro/oscuro según referencia aprobada.');
