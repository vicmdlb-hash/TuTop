import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const project = JSON.parse(fs.readFileSync(path.join(root, 'config/project.json'), 'utf8'));
const workflow = path.join(root, '.github/workflows/android-debug-apk.yml');
const qualityWorkflow = path.join(root, '.github/workflows/quality.yml');

const errors = [];
if (project.applicationId !== 'mx.tutop.app') errors.push('applicationId distinto de mx.tutop.app');
if (project.applicationIdConfirmed !== true) errors.push('applicationId no confirmado');
if (!fs.existsSync(workflow)) errors.push('falta workflow Android');
if (!fs.existsSync(qualityWorkflow)) errors.push('falta quality workflow');
if (!fs.existsSync(path.join(root, 'firebase/firestore.rules'))) errors.push('faltan Firestore rules Spark');
if (!fs.existsSync(path.join(root, 'src/services/onlineBackend.ts'))) errors.push('falta backend online');

console.log(`TuTop ${pkg.version}`);
console.log(`applicationId: ${project.applicationId}`);
console.log(`GitHub APK workflow: ${fs.existsSync(workflow) ? 'READY' : 'MISSING'}`);
console.log(`GitHub quality workflow: ${fs.existsSync(qualityWorkflow) ? 'READY' : 'MISSING'}`);
console.log(`Resultado: ${errors.length ? 'FAIL' : 'READY FOR GITHUB'}`);
for (const error of errors) console.error(`ERROR ${error}`);
process.exit(errors.length ? 1 : 0);
