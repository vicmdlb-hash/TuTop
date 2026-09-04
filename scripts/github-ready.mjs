import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const errors = [];
const warnings = [];
const required = [
  '.github/workflows/android-debug-apk.yml',
  '.github/workflows/quality.yml',
  '.github/dependabot.yml',
  '.github/pull_request_template.md',
  '.github/CODEOWNERS',
  'SECURITY.md',
];

for (const relative of required) {
  if (!fs.existsSync(path.join(root, relative))) errors.push(`Falta ${relative}`);
}

const android = fs.readFileSync(path.join(root, '.github/workflows/android-debug-apk.yml'), 'utf8');
const quality = fs.readFileSync(path.join(root, '.github/workflows/quality.yml'), 'utf8');
const project = JSON.parse(fs.readFileSync(path.join(root, 'config/project.json'), 'utf8'));

for (const marker of ['npm ci', 'npm run check', 'npm run beta:ready', 'assembleDebug', 'actions/upload-artifact']) {
  if (!android.includes(marker)) errors.push(`Workflow Android no contiene: ${marker}`);
}
for (const marker of ['npm ci', 'npm run check', 'npm run typecheck', 'npm run build', 'actions/upload-artifact']) {
  if (!quality.includes(marker)) errors.push(`Workflow quality no contiene: ${marker}`);
}

if (project.zeroInvestmentMode !== true || project.billingAllowed !== false) errors.push('El proyecto dejó de estar bloqueado a cero inversión.');
if (/secrets\.[A-Z0-9_]+/.test(android + quality)) warnings.push('Hay referencias a GitHub Secrets. Revísalas antes de activar el workflow.');

for (const warning of warnings) console.log(`WARN ${warning}`);
for (const error of errors) console.error(`FAIL ${error}`);
console.log(errors.length ? `GitHub readiness FAIL · ${errors.length} problema(s).` : '✅ GitHub readiness PASS.');
process.exit(errors.length ? 1 : 0);
