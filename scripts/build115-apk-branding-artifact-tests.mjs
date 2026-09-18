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

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tutop-apk-branding-'));
try {
  execFileSync('unzip', ['-q', apk, '-d', dir]);

  const launcher = path.join(dir, 'res/mipmap-xxxhdpi-v4/ic_launcher.png');
  const foreground = path.join(dir, 'res/mipmap-xxxhdpi-v4/ic_launcher_foreground.png');
  const background = path.join(dir, 'res/mipmap-xxxhdpi-v4/ic_launcher_background.png');
  const splash = path.join(dir, 'res/drawable-port-xxxhdpi-v4/splash.png');

  for (const file of [launcher, foreground, background, splash]) {
    assert.ok(fs.existsSync(file), `missing packaged visual asset: ${path.relative(dir,file)}`);
  }

  async function raw(file) {
    return sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  }
  function isNonWhite(r,g,b,a,threshold=242) {
    return a > 8 && (r < threshold || g < threshold || b < threshold);
  }
  function regionRatio(buf, x0, y0, x1, y1) {
    const {data,info}=buf;
    const left=Math.max(0,Math.floor(info.width*x0));
    const right=Math.min(info.width,Math.ceil(info.width*x1));
    const top=Math.max(0,Math.floor(info.height*y0));
    const bottom=Math.min(info.height,Math.ceil(info.height*y1));
    let n=0,total=0;
    for(let y=top;y<bottom;y++){
      for(let x=left;x<right;x++){
        const i=(y*info.width+x)*4;
        if(isNonWhite(data[i],data[i+1],data[i+2],data[i+3])) n++;
        total++;
      }
    }
    return total ? n/total : 0;
  }
  function alphaRatio(buf) {
    const {data,info}=buf;
    let n=0;
    for(let i=3;i<data.length;i+=4) if(data[i]>8) n++;
    return n/(info.width*info.height);
  }
  function nonWhiteRatio(buf) {
    const {data,info}=buf;
    let n=0;
    for(let i=0;i<data.length;i+=4) if(isNonWhite(data[i],data[i+1],data[i+2],data[i+3],245)) n++;
    return n/(info.width*info.height);
  }

  const launcherBuf=await raw(launcher);
  const foregroundBuf=await raw(foreground);
  const backgroundBuf=await raw(background);
  const splashBuf=await raw(splash);

  const metrics={
    launcherAlpha:alphaRatio(launcherBuf),
    launcherNonWhite:nonWhiteRatio(launcherBuf),
    launcherBottomCenter:regionRatio(launcherBuf,0.18,0.78,0.82,0.96),
    launcherCaptionStrip:regionRatio(launcherBuf,0.15,0.94,0.85,1.00),
    foregroundAlpha:alphaRatio(foregroundBuf),
    backgroundAlpha:alphaRatio(backgroundBuf),
    splashNonWhite:nonWhiteRatio(splashBuf),
    splashUpperCenter:regionRatio(splashBuf,0.28,0.02,0.72,0.58),
    splashUpperLeft:regionRatio(splashBuf,0.00,0.00,0.28,0.62),
    splashLeftBoardArtifact:regionRatio(splashBuf,0.285,0.08,0.325,0.25),
    splashUpperRight:regionRatio(splashBuf,0.72,0.00,1.00,0.62),
    splashLowerBrand:regionRatio(splashBuf,0.18,0.58,0.82,0.86),
    splashBottom:regionRatio(splashBuf,0.00,0.86,1.00,1.00),
  };

  assert.ok(metrics.launcherAlpha > 0.80, `launcher unexpectedly transparent: ${JSON.stringify(metrics)}`);
  assert.ok(metrics.launcherNonWhite > 0.50, `launcher lacks approved purple tile: ${JSON.stringify(metrics)}`);
  // Build112's board-caption residue left a mostly white lower band. A clean icon stays purple in the center-bottom.
  assert.ok(metrics.launcherBottomCenter > 0.70, `launcher likely lacks the approved tile near its lower center: ${JSON.stringify(metrics)}`);
  assert.ok(metrics.launcherCaptionStrip < 0.01, `launcher board caption residue detected below icon tile: ${JSON.stringify(metrics)}`);
  assert.ok(metrics.foregroundAlpha > 0.01, `adaptive foreground empty: ${JSON.stringify(metrics)}`);
  assert.ok(metrics.backgroundAlpha > 0.90, `adaptive background empty: ${JSON.stringify(metrics)}`);

  assert.ok(metrics.splashUpperCenter > 0.10, `Topi missing from splash center: ${JSON.stringify(metrics)}`);
  // Build115 mascot is cropped and centered; approved composition must leave clean white side gutters.
  assert.ok(metrics.splashUpperLeft < 0.01, `left palette/board residue detected in splash: ${JSON.stringify(metrics)}`);
  assert.ok(metrics.splashLeftBoardArtifact < 0.01, `detached purple board artifact detected left of Topi: ${JSON.stringify(metrics)}`);
  assert.ok(metrics.splashUpperRight < 0.01, `right palette/board residue detected in splash: ${JSON.stringify(metrics)}`);
  assert.ok(metrics.splashLowerBrand > 0.015, `TuTop/tagline missing or clipped from splash: ${JSON.stringify(metrics)}`);
  assert.ok(metrics.splashBottom < 0.03, `splash content overflows safe bottom area: ${JSON.stringify(metrics)}`);

  // Detect a destructive internal white band such as build113's mask overlays:
  // inside the upper-center mascot envelope, no long interior band may collapse
  // almost completely to background while visible mascot pixels exist above and below.
  const {data:sd,info:si}=splashBuf;
  const x0=Math.floor(si.width*0.30), x1=Math.ceil(si.width*0.70);
  const y0=Math.floor(si.height*0.03), y1=Math.ceil(si.height*0.55);
  const rowRatios=[];
  for(let y=y0;y<y1;y++){
    let colored=0,total=0;
    for(let x=x0;x<x1;x++){
      const i=(y*si.width+x)*4;
      if(isNonWhite(sd[i],sd[i+1],sd[i+2],sd[i+3])) colored++;
      total++;
    }
    rowRatios.push(total?colored/total:0);
  }
  const activeRows=rowRatios.map((v,i)=>v>0.035?i:-1).filter((i)=>i>=0);
  if(activeRows.length>12){
    const first=activeRows[0], last=activeRows[activeRows.length-1];
    let longestGap=0,current=0;
    for(let i=first;i<=last;i++){
      if(rowRatios[i]<0.002){ current++; longestGap=Math.max(longestGap,current); }
      else current=0;
    }
    const maxAllowed=Math.max(10,Math.floor((last-first+1)*0.055));
    assert.ok(longestGap<=maxAllowed, `destructive internal white band detected in Topi: gap=${longestGap}, allowed=${maxAllowed}, metrics=${JSON.stringify(metrics)}`);
  }
  assert.ok(metrics.splashNonWhite > 0.07, `splash too empty: ${JSON.stringify(metrics)}`);

  const publicAssets = path.join(dir,'assets/public/assets');
  const jsText = fs.readdirSync(publicAssets)
    .filter((name)=>name.endsWith('.js'))
    .map((name)=>fs.readFileSync(path.join(publicAssets,name),'utf8'))
    .join('\n');
  assert.match(jsText, /¿Usabas TuTop antes\? Recuperar cuenta anterior/);
  assert.doesNotMatch(jsText, />Cuenta anterior<\/button>/);
  assert.doesNotMatch(jsText, /TuTop está terminando de preparar el acceso\./);
  assert.match(jsText, /Descubre, conecta y encuentra cerca de ti\./);

  console.log(JSON.stringify({status:'PASS',metrics}));
} finally {
  fs.rmSync(dir,{recursive:true,force:true});
}
