import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const require = createRequire(import.meta.url);
const appVersion = String(process.env.TUTOP_BETA_VERSION || process.env.VITE_TUTOP_APP_VERSION || '0.9.2-beta.2').trim();

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
  iconReference: path.join(root, 'assets/branding/tutop-app-icon-reference.webp'),
  topiReference: path.join(root, 'assets/branding/topi-reference.webp'),
};
for (const source of Object.values(brand)) {
  if (!fs.existsSync(source)) stop(`Falta raster de referencia TuTop: ${path.relative(root, source)}`);
}

const SIZE = 2732;

async function makeSplash() {
  const topi = await sharp(brand.topiReference)
    .resize({ width: 1080, height: 1280, fit: 'inside', withoutEnlargement: false })
    .png()
    .toBuffer();
  const topiMeta = await sharp(topi).metadata();
  const left = Math.round((SIZE - Number(topiMeta.width || 1080)) / 2);
  const top = 170;

  const overlay = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}">
    <text x="1366" y="1835" text-anchor="middle" font-family="Arial Black,Arial,Helvetica,sans-serif" font-size="330" font-weight="900" letter-spacing="-24" fill="#4B2EDB">Tu<tspan fill="#7C4DFF">Top</tspan></text>
    <text x="1366" y="2055" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="72" font-weight="700" fill="#4B2EDB">Descubre, conecta y encuentra cerca de ti.</text>
    <circle cx="1266" cy="2240" r="22" fill="#7C4DFF"/><circle cx="1366" cy="2240" r="22" fill="#D8C8FF"/><circle cx="1466" cy="2240" r="22" fill="#D8C8FF"/>
  </svg>`);

  return sharp({
    create: { width: SIZE, height: SIZE, channels: 4, background: '#FFFFFF' },
  })
    .composite([{ input: topi, left, top }, { input: overlay, left: 0, top: 0 }])
    .png()
    .toBuffer();
}

async function renderBrandAssets() {
  // Do not rasterize an SVG that itself embeds WebP: build111 proved that path can silently drop the image.
  await sharp(brand.iconReference)
    .resize(1024, 1024, { fit: 'cover' })
    .png()
    .toFile(path.join(root, 'assets/icon-only.png'));

  const foregroundSvg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><text x="512" y="590" text-anchor="middle" font-family="Arial Black,Arial,Helvetica,sans-serif" font-size="250" font-weight="900" letter-spacing="-18" fill="#FFFFFF">TuTop</text></svg>');
  const backgroundSvg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><defs><linearGradient id="r" x1="120" y1="80" x2="900" y2="950" gradientUnits="userSpaceOnUse"><stop stop-color="#B99BFF"/><stop offset=".45" stop-color="#7C4DFF"/><stop offset="1" stop-color="#653AD9"/></linearGradient></defs><rect width="1024" height="1024" rx="224" fill="url(#r)"/></svg>');

  await sharp(foregroundSvg).png().toFile(path.join(root, 'assets/icon-foreground.png'));
  await sharp(backgroundSvg).png().toFile(path.join(root, 'assets/icon-background.png'));

  const splash = await makeSplash();
  fs.writeFileSync(path.join(root, 'assets/splash.png'), splash);
  fs.writeFileSync(path.join(root, 'assets/splash-dark.png'), splash);
}

await renderBrandAssets();

const required = [
  ['assets/icon-only.png', 1024, 1024],
  ['assets/icon-foreground.png', 1024, 1024],
  ['assets/icon-background.png', 1024, 1024],
  ['assets/splash.png', 2732, 2732],
  ['assets/splash-dark.png', 2732, 2732],
];

for (const [relative, width, height] of required) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) stop(`Falta asset canónico para Android: ${relative}`);
  const metadata = await sharp(file).metadata();
  if (metadata.width !== width || metadata.height !== height) stop(`${relative} debe medir exactamente ${width}x${height}.`);
}

if (!fs.existsSync(path.join(root, 'android'))) stop('No existe /android. Ejecuta primero npm run android:bootstrap.');
if (!fs.existsSync(path.join(root, 'node_modules/@capacitor/assets'))) stop('Falta @capacitor/assets. Ejecuta npm run deps:mobile.');

const args = [
  '@capacitor/assets', 'generate', '--android',
  '--iconBackgroundColor', '#7C4DFF',
  '--iconBackgroundColorDark', '#7C4DFF',
  '--splashBackgroundColor', '#FFFFFF',
  '--splashBackgroundColorDark', '#FFFFFF',
];
const result = spawnSync('npx', args, {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
if (result.status !== 0) process.exit(result.status || 1);
console.log(`✅ Branding Android ${appVersion}: raster de referencia directo + Topi visible + splash blanco.`);
