import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sharp = require('sharp');
const apk = process.argv[2] || 'android/app/build/outputs/apk/debug/app-debug.apk';
if (!fs.existsSync(apk)) throw new Error('APK_MISSING');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tutop-apk-visual-'));
try {
  execFileSync('unzip', ['-q', apk, '-d', dir]);

  const launcher = path.join(dir, 'res/mipmap-xxxhdpi-v4/ic_launcher.png');
  const foreground = path.join(dir, 'res/mipmap-xxxhdpi-v4/ic_launcher_foreground.png');
  const background = path.join(dir, 'res/mipmap-xxxhdpi-v4/ic_launcher_background.png');
  const splash = path.join(dir, 'res/drawable-port-xxxhdpi-v4/splash.png');

  for (const file of [launcher, foreground, background, splash]) {
    assert.ok(fs.existsSync(file), `missing packaged visual asset: ${path.relative(dir,file)}`);
  }

  async function pixelAudit(file) {
    const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let nonTransparent = 0;
    let nonWhite = 0;
    for (let i = 0; i < data.length; i += 4) {
      const r=data[i], g=data[i+1], b=data[i+2], a=data[i+3];
      if (a > 8) nonTransparent++;
      if (a > 8 && (r < 245 || g < 245 || b < 245)) nonWhite++;
    }
    const total = info.width * info.height;
    return { width: info.width, height: info.height, nonTransparentRatio: nonTransparent/total, nonWhiteRatio: nonWhite/total };
  }

  const launcherAudit = await pixelAudit(launcher);
  const foregroundAudit = await pixelAudit(foreground);
  const backgroundAudit = await pixelAudit(background);
  const splashAudit = await pixelAudit(splash);

  assert.ok(launcherAudit.nonTransparentRatio > 0.45, `legacy launcher became transparent: ${JSON.stringify(launcherAudit)}`);
  assert.ok(launcherAudit.nonWhiteRatio > 0.20, `legacy launcher lacks visible brand pixels: ${JSON.stringify(launcherAudit)}`);
  assert.ok(foregroundAudit.nonTransparentRatio > 0.01, `adaptive foreground empty: ${JSON.stringify(foregroundAudit)}`);
  assert.ok(backgroundAudit.nonTransparentRatio > 0.90, `adaptive background empty: ${JSON.stringify(backgroundAudit)}`);

  const upperHeight = Math.floor(splashAudit.height * 0.58);
  const upper = await sharp(splash).extract({ left:0, top:0, width:splashAudit.width, height:upperHeight }).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  let upperNonWhite=0;
  for(let i=0;i<upper.data.length;i+=4){
    const r=upper.data[i], g=upper.data[i+1], b=upper.data[i+2], a=upper.data[i+3];
    if(a>8 && (r<242 || g<242 || b<242)) upperNonWhite++;
  }
  const upperRatio=upperNonWhite/(upper.info.width*upper.info.height);
  assert.ok(upperRatio > 0.035, `Topi/reference image missing from upper splash region: ratio=${upperRatio}`);
  assert.ok(splashAudit.nonWhiteRatio > 0.06, `splash lacks enough visible brand content: ${JSON.stringify(splashAudit)}`);

  const publicAssets = path.join(dir,'assets/public/assets');
  const jsText = fs.readdirSync(publicAssets)
    .filter((name)=>name.endsWith('.js'))
    .map((name)=>fs.readFileSync(path.join(publicAssets,name),'utf8'))
    .join('\n');
  assert.match(jsText, /¿Usabas TuTop antes\? Recuperar cuenta anterior/);
  assert.doesNotMatch(jsText, />Cuenta anterior<\/button>/);
  assert.doesNotMatch(jsText, /TuTop está terminando de preparar el acceso\./);
  assert.match(jsText, /Descubre, conecta y encuentra cerca de ti\./);

  console.log(JSON.stringify({status:'PASS',launcherAudit,foregroundAudit,backgroundAudit,splashAudit,upperNonWhiteRatio:upperRatio}));
} finally {
  fs.rmSync(dir,{recursive:true,force:true});
}
