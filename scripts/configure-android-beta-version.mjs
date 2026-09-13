import fs from 'node:fs';

const gradlePath = 'android/app/build.gradle';
const packageVersion = JSON.parse(fs.readFileSync('package.json', 'utf8')).version;
const expectedVersionName = String(process.env.TUTOP_BETA_VERSION || packageVersion).trim();

function stop(message) { console.error(`DETENIDO: ${message}`); process.exit(2); }
const versionMatch = expectedVersionName.match(/^0\.9\.(1|2)-beta\.(\d+)$/);
if (!versionMatch) stop(`versionName inesperado: ${expectedVersionName}`);
const minor = Number(versionMatch[1]);
const defaultCode = minor === 1 ? 90100 : 90200;
const versionCode = Number(process.env.TUTOP_ANDROID_VERSION_CODE || defaultCode);
const minCode = minor === 1 ? 90100 : 90200;
const maxCode = minor === 1 ? 90199 : 90299;
if (!Number.isInteger(versionCode) || versionCode < minCode || versionCode > maxCode) stop(`versionCode fuera del rango 0.9.${minor} beta: ${versionCode}`);
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
