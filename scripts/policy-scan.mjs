import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const errors = [];
const warnings = [];
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const firebaseConfig = JSON.parse(read('firebase.json'));
const rules = read('firebase/firestore.rules');
const envExample = read('.env.example');
const paidUpload = read('scripts/upload-internal-sharing.mjs');
const paidRelease = read('scripts/release-internal.mjs');

// Zero-investment/Spark policy: paid-gated services must not be active.
if (firebaseConfig.functions) errors.push('firebase.json activo no debe desplegar Cloud Functions en modo cero inversión.');
if (firebaseConfig.storage) errors.push('firebase.json activo no debe desplegar Cloud Storage en modo cero inversión.');
for (const token of ['match /wallets/{uid}', 'match /wallet_transactions/{transactionId}', 'match /bids/{bidId}', 'match /verificationRequests/{uid}', 'match /admins/{uid}']) {
  if (!rules.includes(token)) errors.push(`Firestore rules no contienen ${token}`);
}
if (!rules.includes('request.resource.data.balance == 10')) errors.push('No se detectó límite del bono inicial de 10 UCoins.');
if (!rules.includes('getAfter(/databases/$(database)/documents/bids/')) errors.push('Wallet no parece enlazada atómicamente a bids.');
if (!rules.match(/match \/products\/\{productId\}[\s\S]*?vendedor_id == request\.auth\.uid[\s\S]*?allow delete: if false;/)) errors.push('Products no parecen protegidos por propietario y delete=false.');
if (/VITE_TUTOP_BACKEND=demo/i.test(envExample)) errors.push('.env.example no debe sugerir backend demo en la beta activa.');
if (/GOOGLE_APPLICATION_CREDENTIALS|service-account\.json/i.test(envExample)) errors.push('.env.example activo no debe pedir credenciales Google Play/service-account.');
if (!rules.match(/match \/admins\/\{uid\}[\s\S]*?allow write: if false;/)) errors.push('Admins debe ser bootstrap manual; client writes deben estar bloqueados.');

const sensitiveNames = [/service-account.*\.json$/i, /google-play.*\.json$/i, /\.jks$/i, /\.keystore$/i];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['.git', 'node_modules', 'dist', 'lib'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (sensitiveNames.some((pattern) => pattern.test(entry.name))) errors.push(`Posible secreto dentro del repo: ${path.relative(root, full)}`);
  }
}
walk(root);

const capacitor = JSON.parse(read('capacitor.config.json'));
const project = JSON.parse(read('config/project.json'));
if (project.applicationId !== capacitor.appId) errors.push('config/project.json y capacitor.config.json no coinciden en applicationId.');
if (capacitor.appId === 'mx.tutop.app' && project.applicationIdConfirmed !== true) warnings.push('applicationId sigue provisional hasta confirmación explícita del usuario.');
if (project.productionPublishingAllowed !== false) errors.push('El proyecto debe mantener Production bloqueado durante la beta privada.');
if (project.billingAllowed !== false || project.zeroInvestmentMode !== true) errors.push('El proyecto debe conservar zeroInvestmentMode=true y billingAllowed=false.');
if (!paidUpload.includes('zeroInvestmentMode === true') || !paidUpload.includes('billingAllowed !== true')) errors.push('Upload Google Play futuro no está bloqueado por zeroInvestmentMode/billingAllowed.');
if (!paidRelease.includes('zeroInvestmentMode === true') || !paidRelease.includes('billingAllowed !== true')) errors.push('Release Google Play futuro no está bloqueado por zeroInvestmentMode/billingAllowed.');

if (!fs.existsSync(path.join(root, 'firebase.blaze.json'))) warnings.push('No existe backup de configuración Blaze para la fase futura.');
if (!fs.existsSync(path.join(root, 'firebase/firestore.blaze.rules'))) warnings.push('No existe backup de rules Blaze para la fase futura.');

warnings.forEach((item) => console.log(`WARN ${item}`));
errors.forEach((item) => console.error(`ERROR ${item}`));
console.log(errors.length ? 'Policy scan FAIL.' : 'Policy scan OK (Spark / cero inversión).');
process.exit(errors.length ? 1 : 0);
