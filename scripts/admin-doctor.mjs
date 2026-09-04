import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const checks = [
  ['src/admin/AdminDashboard.tsx', 'UI React MiTuTop Admin'],
  ['preview/MiTuTop_Admin_Online.html', 'admin HTML independiente'],
  ['src/services/onlineBackend.ts', 'acciones admin online'],
  ['firebase/firestore.rules', 'reglas de acceso admin'],
  ['firebase.json', 'Hosting/config Spark'],
];

let failures = 0;
for (const [file, label] of checks) {
  const ok = fs.existsSync(path.join(root, file));
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}: ${file}`);
  if (!ok) failures += 1;
}

const online = fs.readFileSync(path.join(root, 'src/services/onlineBackend.ts'), 'utf8');
for (const symbol of ['adminApproveVerification', 'adminResolveReport', 'adminSetSuspension']) {
  const ok = online.includes(symbol);
  console.log(`${ok ? 'PASS' : 'FAIL'} Online admin action ${symbol}`);
  if (!ok) failures += 1;
}

const rules = fs.readFileSync(path.join(root, 'firebase/firestore.rules'), 'utf8');
for (const marker of ['match /admins/{uid}', 'isAdmin()', 'match /verificationRequests/{uid}', 'match /moderationStatus/{uid}']) {
  const ok = rules.includes(marker);
  console.log(`${ok ? 'PASS' : 'FAIL'} Firestore marker ${marker}`);
  if (!ok) failures += 1;
}

const firebase = JSON.parse(fs.readFileSync(path.join(root, 'firebase.json'), 'utf8'));
const sparkOnly = !firebase.functions && !firebase.storage;
console.log(`${sparkOnly ? 'PASS' : 'FAIL'} firebase.json activo Spark-only`);
if (!sparkOnly) failures += 1;

const packageName = JSON.parse(fs.readFileSync(path.join(root, 'capacitor.config.json'), 'utf8')).appId;
console.log(`${packageName === 'mx.tutop.app' ? 'PASS' : 'FAIL'} applicationId: ${packageName}`);
if (packageName !== 'mx.tutop.app') failures += 1;

if (failures) {
  console.error(`Admin doctor: ${failures} fallo(s).`);
  process.exit(1);
}
console.log('Admin doctor Spark: PASS. Pendiente externo: Firebase real + bootstrap admins/{uid}.active=true.');
