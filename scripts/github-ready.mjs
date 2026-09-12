import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const errors = [];
const warnings = [];
const required = [
  '.github/workflows/android-debug-apk.yml',
  '.github/workflows/quality.yml',
  '.github/workflows/firestore-v2-security.yml',
  '.github/workflows/october-01-validation.yml',
  '.github/workflows/staging-v2-smoke.yml',
  '.github/workflows/v2-trusted-maintenance.yml',
  '.github/dependabot.yml',
  '.github/pull_request_template.md',
  '.github/CODEOWNERS',
  'docs/RUNTIME_FREEZE_CANDIDATE_0.9.json',
  'docs/GATE_EXECUTION_DOSSIER_0.9.md',
  'SECURITY.md',
];

for (const relative of required) {
  if (!fs.existsSync(path.join(root, relative))) errors.push(`Falta ${relative}`);
}

const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const android = read('.github/workflows/android-debug-apk.yml');
const quality = read('.github/workflows/quality.yml');
const firestore = read('.github/workflows/firestore-v2-security.yml');
const october = read('.github/workflows/october-01-validation.yml');
const staging = read('.github/workflows/staging-v2-smoke.yml');
const trusted = read('.github/workflows/v2-trusted-maintenance.yml');
const pkg = JSON.parse(read('package.json'));
const project = JSON.parse(read('config/project.json'));
const freeze = JSON.parse(read('docs/RUNTIME_FREEZE_CANDIDATE_0.9.json'));

for (const marker of ['npm ci', 'npm run check', 'npm run beta:ready', 'assembleDebug', 'actions/upload-artifact']) {
  if (!android.includes(marker)) errors.push(`Workflow Android no contiene: ${marker}`);
}
for (const marker of ['npm ci', 'npm run check', 'npm run build']) {
  if (!quality.includes(marker)) errors.push(`Workflow quality no contiene: ${marker}`);
}
if (quality.includes('actions/upload-artifact')) errors.push('Quality es diagnóstico y no debe publicar artefactos durante Runtime Freeze.');
if (quality.includes('npm run typecheck')) errors.push('Quality no debe repetir typecheck antes del build canónico.');
if (!firestore.includes('Firestore V2 emulator security')) errors.push('Firestore V2 dejó de tener su gate aislado.');
for (const marker of ['npm run check', 'npm run build', 'npm run v2:rules:prepare', 'emulators:exec --only firestore']) {
  if (!october.includes(marker)) errors.push(`October gate no contiene: ${marker}`);
}
if (october.includes('npm run typecheck')) errors.push('October no debe repetir typecheck antes de npm run build.');
if (pkg.scripts?.typecheck !== 'tsc --noEmit' || pkg.scripts?.build !== 'npm run typecheck && vite build') {
  errors.push('npm run build debe conservar el typecheck canónico una sola vez antes de Vite.');
}

for (const [name, workflow] of [
  ['Android', android],
  ['Staging real', staging],
  ['Quality', quality],
  ['Firestore V2', firestore],
  ['Trusted maintenance', trusted],
  ['October consolidated gate', october],
]) {
  if (!workflow.includes('workflow_dispatch:')) errors.push(`${name} dejó de poder ejecutarse manualmente.`);
  if (/\n\s+push:|\n\s+pull_request:|\n\s+schedule:/.test(workflow)) errors.push(`${name} debe permanecer manual-only para preservar minutos.`);
}

for (const [name, workflow] of [['Android', android], ['Staging real', staging], ['Trusted maintenance', trusted]]) {
  if (!workflow.includes('cancel-in-progress: false')) errors.push(`${name} no debe cancelar una ejecución activa a mitad de una operación remota.`);
}

const branchFilterCount = (workflow) => (workflow.match(/-f branch="\$GITHUB_REF_NAME"/g) || []).length;
if (!staging.includes('october-01-validation.yml/runs') || !staging.includes('head_sha="$GITHUB_SHA"')
    || !staging.includes('TUTOP_VALIDATED_GATE_SHA=$GITHUB_SHA') || branchFilterCount(staging) < 1) {
  errors.push('Staging no está ligado a October green de la misma rama y SHA.');
}
if (!android.includes('october-01-validation.yml/runs') || !android.includes('staging-v2-smoke.yml/runs')
    || !android.includes('TUTOP_VALIDATED_GATE_SHA=$GITHUB_SHA') || !android.includes('TUTOP_VALIDATED_STAGING_SHA=$GITHUB_SHA')
    || branchFilterCount(android) < 2) {
  errors.push('Android no está ligado a October + staging de la misma rama y SHA.');
}
if (!trusted.includes('october-01-validation.yml/runs') || !trusted.includes('staging-v2-smoke.yml/runs')
    || !trusted.includes('gated-trusted-staging-apply.mjs') || branchFilterCount(trusted) < 2) {
  errors.push('Trusted maintenance perdió su cadena same-branch/same-SHA/wrapper.');
}

if (freeze.status !== 'runtime_freeze_candidate' || freeze.runtime_validated !== false || freeze.feature_freeze !== true) {
  errors.push('Manifest Runtime Freeze no está en estado fail-closed esperado.');
}
if (freeze.current_physical_qa_candidate !== null) errors.push('Runtime Freeze no debe declarar candidato Physical QA vigente antes del gate real.');
if (project.zeroInvestmentMode !== true || project.billingAllowed !== false || project.productionPublishingAllowed !== false) {
  errors.push('El proyecto dejó de estar bloqueado a cero inversión/producción.');
}
if (/secrets\.[A-Z0-9_]+/.test(android + quality + firestore + staging + trusted + october)) {
  warnings.push('Hay referencias a GitHub Secrets. Deben existir sólo en los workflows manuales que realmente las necesitan.');
}

for (const warning of warnings) console.log(`WARN ${warning}`);
for (const error of errors) console.error(`FAIL ${error}`);
console.log(errors.length ? `GitHub readiness FAIL · ${errors.length} problema(s).` : '✅ GitHub readiness PASS · runtime freeze chain prepared, not runtime validated.');
process.exit(errors.length ? 1 : 0);
