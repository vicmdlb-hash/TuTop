import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (path) => fs.readFileSync(path, 'utf8');
const pkg = JSON.parse(read('package.json'));
const main = read('src/main.tsx');
const theme = read('src/lib/theme091.ts');
const appearance = read('src/components/AppearanceSettings.tsx');
const brand = read('src/brand091.css');
const android = read('.github/workflows/android-debug-apk.yml');
const october = read('.github/workflows/october-01-validation.yml');
const staging = read('.github/workflows/staging-v2-smoke.yml');
const quality = read('.github/workflows/quality.yml');
const guard = read('scripts/staging-freeze-guard.mjs');
const exporter = read('scripts/export-staging-v2-build-env.mjs');
const versioner = read('scripts/configure-android-beta-version.mjs');
const generator = read('scripts/generate-physical-qa-candidate.mjs');
const aiRuntimeSmoke = read('scripts/staging-topi-ai-runtime-smoke.mjs');
const oldCandidate = JSON.parse(read('docs/PHYSICAL_QA_CANDIDATE_0.9.json'));

assert.equal(pkg.version, '0.9.1-beta.0');
assert.match(main, /initializeTheme091\(\)/);
assert.match(main, /import '\.\/brand091\.css'/);
assert.match(theme, /ThemePreference = 'light' \| 'dark' \| 'system'/);
assert.match(theme, /return value === 'dark' \|\| value === 'system' \|\| value === 'light' \? value : 'light'/);
assert.match(appearance, /Blanco \+ morado/);
assert.match(appearance, /Negro \+ morado/);
assert.match(brand, /html\[data-theme="light"\]/);
assert.match(brand, /html\[data-theme="dark"\]/);

for (const source of [quality, october, staging, android, guard]) {
  assert.match(source, /feat\/tutop-0\.9\.1-nearby-topi/);
}
assert.doesNotMatch(android, /feat\/tutop-0\.8-p0/);
assert.match(android, /TUTOP_BETA_VERSION: 0\.9\.1-beta\.0/);
assert.match(android, /TUTOP_ANDROID_VERSION_CODE: 90100/);
assert.match(android, /PHYSICAL_QA_CANDIDATE_0\.9\.1\.generated\.json/);
assert.doesNotMatch(android, /TuTop-0\.9\.0-beta\.0-physical-qa/);
assert.match(exporter, /0\.9\.1-beta\.0/);
assert.match(exporter, /\^0\\\.9\\\.1-beta/);
assert.match(exporter, /VITE_TUTOP_TOPI_FIREBASE_AI_ENABLED=true/);
assert.match(exporter, /VITE_TUTOP_TOPI_MODEL=gemini-3\.8-flash/);
assert.match(versioner, /0\.9\.1-beta/);
assert.match(versioner, /90100/);
assert.match(generator, /0\.9\.1-beta/);
assert.match(generator, /PHYSICAL_QA_CANDIDATE_0\.9\.1\.generated\.json/);

// Staging must prove the remote Firebase AI path actually answers before Android can promote.
assert.match(staging, /Prove Firebase AI Logic generateContent runtime/);
assert.match(staging, /node scripts\/staging-topi-ai-runtime-smoke\.mjs/);
assert.match(staging, /TUTOP_TOPI_AI_MODEL: gemini-3\.8-flash/);
assert(staging.indexOf('Prepare staging Web App runtime config') < staging.indexOf('Prove Firebase AI Logic generateContent runtime'));
assert(staging.indexOf('Prove Firebase AI Logic generateContent runtime') < staging.indexOf('Provision and validate staging Android Firebase app'));
assert.match(aiRuntimeSmoke, /getAI\(app, \{ backend: new GoogleAIBackend\(\) \}\)/);
assert.match(aiRuntimeSmoke, /getGenerativeModel/);
assert.match(aiRuntimeSmoke, /model\.generateContent/);
assert.match(aiRuntimeSmoke, /gemini-3\.8-flash/);
assert.match(aiRuntimeSmoke, /TUTOP_AI_RUNTIME_OK_091/);
assert.match(aiRuntimeSmoke, /STAGING_TOPI_AI_TIMEOUT/);
assert.doesNotMatch(aiRuntimeSmoke, /authorization['"]?\s*:|GEMINI_API_KEY|PROVIDER_API_KEY/i);

// APK28 remains historical 0.9.0 evidence. 0.9.1 must never mutate or reuse it as its candidate.
assert.equal(oldCandidate.app_version, '0.9.0-beta.0');
assert.equal(oldCandidate.artifact_id, 10292454237);
assert.equal(oldCandidate.apk_sha256, '2131007fb944b144d85eb8c5deb9ad80f93bd20c1515b7793f89278cd1a9f7e3');
assert.doesNotMatch(android, /PHYSICAL_QA_CANDIDATE_0\.9\.json/);

console.log('PASS TuTop 0.9.1 version and Android 90100 identity are isolated from APK28');
console.log('PASS white-purple default, black-purple dark and system theme are wired before App render');
console.log('PASS Quality, October, Staging and Android gates target the 0.9.1 branch');
console.log('PASS staging export enables Topi Firebase AI without provider secrets');
console.log('PASS staging requires real Firebase AI Logic generateContent proof before Android promotion');
console.log('TuTop 0.9.1 release/theme/AI isolation contract: PASS');
