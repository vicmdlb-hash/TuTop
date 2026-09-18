import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const require = createRequire(import.meta.url);
const appVersion = String(process.env.TUTOP_BETA_VERSION || process.env.VITE_TUTOP_APP_VERSION || '0.9.2-beta.4').trim();

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

function isVisualPixel(r, g, b, a) {
  if (a < 18) return false;
  // Board background is near-white. Keep colored/dark antialiasing but ignore
  // white/very-light annotation canvas.
  return !(r > 244 && g > 244 && b > 244);
}

async function isolateLargestVisualComponent(source, label, options = {}) {
  // Normalize orientation and format first. Every later crop is against these exact
  // normalized bytes, avoiding the metadata/extract mismatch seen in build113.
  const normalized = await sharp(source).rotate().ensureAlpha().png().toBuffer();
  const { data, info } = await sharp(normalized).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const width = info.width;
  const height = info.height;
  if (!width || !height || width * height < 100) stop(`${label}: raster normalizado inválido.`);

  const total = width * height;
  const mask = new Uint8Array(total);
  for (let p = 0, i = 0; p < total; p++, i += 4) {
    if (isVisualPixel(data[i], data[i + 1], data[i + 2], data[i + 3])) mask[p] = 1;
  }

  const seen = new Uint8Array(total);
  const queue = new Int32Array(total);
  const components = [];
  const offsets = [
    [-1,-1],[0,-1],[1,-1],
    [-1, 0],       [1, 0],
    [-1, 1],[0, 1],[1, 1],
  ];

  for (let seed = 0; seed < total; seed++) {
    if (!mask[seed] || seen[seed]) continue;
    let head = 0, tail = 0;
    queue[tail++] = seed;
    seen[seed] = 1;
    let area = 0;
    let minX = width, minY = height, maxX = 0, maxY = 0;

    while (head < tail) {
      const p = queue[head++];
      const y = Math.floor(p / width);
      const x = p - y * width;
      area++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;

      for (const [dx, dy] of offsets) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const np = ny * width + nx;
        if (!mask[np] || seen[np]) continue;
        seen[np] = 1;
        queue[tail++] = np;
      }
    }
    components.push({ area, minX, minY, maxX, maxY });
  }

  components.sort((a, b) => b.area - a.area);
  const largest = components[0];
  if (!largest || largest.area < total * (options.minAreaRatio ?? 0.015)) {
    stop(`${label}: no se detectó componente visual principal confiable.`);
  }

  // Include nearby fragments that clearly belong to the same subject (e.g. isolated
  // yarn highlights/eyes) but not distant captions/palette dots.
  const subject = { ...largest };
  const proximity = Math.max(4, Math.round(Math.min(width, height) * (options.proximityRatio ?? 0.035)));
  for (const component of components.slice(1)) {
    if (component.area < largest.area * (options.secondaryAreaRatio ?? 0.012)) continue;
    const horizontalGap = Math.max(0, Math.max(subject.minX, component.minX) - Math.min(subject.maxX, component.maxX) - Math.min(subject.maxX - subject.minX, component.maxX - component.minX));
    const verticalGap = Math.max(0, Math.max(subject.minY, component.minY) - Math.min(subject.maxY, component.maxY) - Math.min(subject.maxY - subject.minY, component.maxY - component.minY));
    const nearX = component.minX <= subject.maxX + proximity && component.maxX >= subject.minX - proximity;
    const nearY = component.minY <= subject.maxY + proximity && component.maxY >= subject.minY - proximity;
    if ((nearX && nearY) || (horizontalGap <= proximity && verticalGap <= proximity)) {
      subject.minX = Math.min(subject.minX, component.minX);
      subject.minY = Math.min(subject.minY, component.minY);
      subject.maxX = Math.max(subject.maxX, component.maxX);
      subject.maxY = Math.max(subject.maxY, component.maxY);
    }
  }

  const padding = Math.max(2, Math.round(Math.min(width, height) * (options.paddingRatio ?? 0.018)));
  const left = Math.max(0, subject.minX - padding);
  const top = Math.max(0, subject.minY - padding);
  const right = Math.min(width - 1, subject.maxX + padding);
  const bottom = Math.min(height - 1, subject.maxY + padding);
  const cropWidth = right - left + 1;
  const cropHeight = bottom - top + 1;
  const cropRatio = (cropWidth * cropHeight) / total;

  if (cropWidth < 24 || cropHeight < 24 || cropRatio > (options.maxCropRatio ?? 0.94)) {
    stop(`${label}: recorte automático no confiable ${cropWidth}x${cropHeight} ratio=${cropRatio.toFixed(3)}.`);
  }

  const output = await sharp(normalized)
    .extract({ left, top, width: cropWidth, height: cropHeight })
    .trim({ background: '#FFFFFF', threshold: 12 })
    .png()
    .toBuffer();

  const outMeta = await sharp(output).metadata();
  console.log(JSON.stringify({
    branding_component: label,
    source: { width, height },
    largest_area: largest.area,
    crop: { left, top, width: cropWidth, height: cropHeight, ratio: Number(cropRatio.toFixed(4)) },
    output: { width: outMeta.width, height: outMeta.height },
  }));
  return output;
}

async function makeSplash() {
  const isolated = await isolateLargestVisualComponent(brand.topiReference, 'topi', {
    minAreaRatio: 0.02,
    maxCropRatio: 0.90,
    proximityRatio: 0.025,
    paddingRatio: 0.015,
    secondaryAreaRatio: 0.02,
  });
  const topi = await sharp(isolated)
    .resize({ width: 900, height: 980, fit: 'inside', withoutEnlargement: false })
    .png()
    .toBuffer();
  const meta = await sharp(topi).metadata();
  const left = Math.round((SIZE - Number(meta.width || 900)) / 2);
  const top = 145;

  const overlay = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}">
    <text x="1366" y="1835" text-anchor="middle" font-family="Arial Black,Arial,Helvetica,sans-serif" font-size="330" font-weight="900" letter-spacing="-24" fill="#4B2EDB">Tu<tspan fill="#7C4DFF">Top</tspan></text>
    <text x="1366" y="2055" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="72" font-weight="700" fill="#4B2EDB">Descubre, conecta y encuentra cerca de ti.</text>
    <circle cx="1266" cy="2240" r="22" fill="#7C4DFF"/><circle cx="1366" cy="2240" r="22" fill="#D8C8FF"/><circle cx="1466" cy="2240" r="22" fill="#D8C8FF"/>
  </svg>`);

  return sharp({ create: { width: SIZE, height: SIZE, channels: 4, background: '#FFFFFF' } })
    .composite([{ input: topi, left, top }, { input: overlay, left: 0, top: 0 }])
    .png()
    .toBuffer();
}

async function renderBrandAssets() {
  const isolatedIcon = await isolateLargestVisualComponent(brand.iconReference, 'launcher', {
    minAreaRatio: 0.08,
    maxCropRatio: 0.85,
    proximityRatio: 0.012,
    paddingRatio: 0.008,
    secondaryAreaRatio: 0.05,
  });
  await sharp(isolatedIcon)
    .resize(1024, 1024, { fit: 'fill' })
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
console.log(`✅ Branding Android ${appVersion}: componente visual principal aislado del tablero aprobado; captions/paletas quedan fuera del artefacto.`);
