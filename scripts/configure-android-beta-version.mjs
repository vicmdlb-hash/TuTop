import fs from 'node:fs';

const gradlePath = 'android/app/build.gradle';
const expectedVersionName = String(process.env.TUTOP_BETA_VERSION || '0.9.0-beta.0').trim();
const versionCode = Number(process.env.TUTOP_ANDROID_VERSION_CODE || 90000);

function stop(message) { console.error(`DETENIDO: ${message}`); process.exit(2); }
if (!/^0\.9\.0-beta\.\d+$/.test(expectedVersionName)) stop(`versionName inesperado: ${expectedVersionName}`);
if (!Number.isInteger(versionCode) || versionCode < 90000 || versionCode > 90099) stop(`versionCode fuera del rango 0.9 beta: ${versionCode}`);
if (!fs.existsSync(gradlePath)) stop(`falta ${gradlePath}; ejecuta android:bootstrap primero.`);

let source = fs.readFileSync(gradlePath, 'utf8');
const codeMatches = source.match(/versionCode\s+\d+/g) || [];
const nameMatches = source.match(/versionName\s+["'][^"']+["']/g) || [];
if (codeMatches.length !== 1) stop(`esperaba un versionCode y encontré ${codeMatches.length}.`);
if (nameMatches.length !== 1) stop(`esperaba un versionName y encontré ${nameMatches.length}.`);
source = source
  .replace(/versionCode\s+\d+/, `versionCode ${versionCode}`)
  .replace(/versionName\s+["'][^"']+["']/, `versionName "${expectedVersionName}"`);
fs.writeFileSync(gradlePath, source);

const verify = fs.readFileSync(gradlePath, 'utf8');
if (!verify.includes(`versionCode ${versionCode}`) || !verify.includes(`versionName "${expectedVersionName}"`)) stop('no pude verificar el versionado Android resultante.');
console.log(`✅ Android beta version fijada: ${expectedVersionName} (${versionCode}).`);
