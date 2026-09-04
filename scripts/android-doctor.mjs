import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const errors = [];
const warnings = [];
const android = path.join(root, 'android');
if (!fs.existsSync(android)) errors.push('No existe /android.');
const scan = [];
function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && !['.gradle', 'build'].includes(entry.name)) walk(full);
    else if (/\.(gradle|kts)$/.test(entry.name)) scan.push(fs.readFileSync(full, 'utf8'));
  }
}
walk(android);
const text = scan.join('\n');
if (fs.existsSync(android) && !/(targetSdk(?:Version)?\s*[= ]\s*36|targetSdk\s+36)/.test(text)) errors.push('No se detectó targetSdk 36.');
if (fs.existsSync(android) && !/(compileSdk(?:Version)?\s*[= ]\s*36|compileSdk\s+36)/.test(text)) errors.push('No se detectó compileSdk 36.');
const config = JSON.parse(fs.readFileSync(path.join(root, 'capacitor.config.json'), 'utf8'));
if (config.appId !== 'mx.tutop.app') errors.push('applicationId debe ser mx.tutop.app.');
errors.forEach((item) => console.error(`ERROR ${item}`));
warnings.forEach((item) => console.log(`WARN ${item}`));
console.log(errors.length ? 'Android doctor FAIL.' : 'Android doctor base OK.');
process.exit(errors.length ? 1 : 0);
