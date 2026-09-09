import fs from 'node:fs';
import assert from 'node:assert/strict';
import { validatePhysicalQaEvidence, loadPhysicalQaCandidate } from './physical-qa-evidence-bundle.mjs';

const now = Date.parse('2026-09-07T02:50:00.000Z');
const template = JSON.parse(fs.readFileSync('docs/PHYSICAL_QA_EVIDENCE_BUNDLE_0.9.json', 'utf8'));
const historical = JSON.parse(fs.readFileSync('docs/PHYSICAL_QA_CANDIDATE_0.9.json', 'utf8'));
assert.equal(historical.physical_release_candidate, false);
assert.equal(historical.candidate_status, 'obsolete_runtime_drift');
assert.throws(() => loadPhysicalQaCandidate(), /PHYSICAL_QA_CANDIDATE_NOT_ACTIVE/);

const exactSha = String(historical.build_commit_sha || '1'.repeat(40));
const candidateManifest = {
  ...historical,
  physical_release_candidate: true,
  candidate_status: 'active_exact_head',
  replacement_required: false,
  build_commit_sha: exactSha,
  gate_commit_sha: exactSha,
  staging_smoke_commit_sha: exactSha,
  artifact_id: 10002986519,
  build_run_id: 34088114928,
  gate_run_id: 34088114001,
  staging_smoke_run_id: 34088114501,
};

const candidateBinding = {
  artifact_name: candidateManifest.artifact_name,
  artifact_id: candidateManifest.artifact_id,
  build_run_id: candidateManifest.build_run_id,
  build_commit_sha: candidateManifest.build_commit_sha,
  build_tree_sha: candidateManifest.build_tree_sha,
  apk_sha256: candidateManifest.apk_sha256,
  gate_run_id: candidateManifest.gate_run_id,
  gate_commit_sha: candidateManifest.gate_commit_sha,
  staging_smoke_run_id: candidateManifest.staging_smoke_run_id,
  staging_smoke_commit_sha: candidateManifest.staging_smoke_commit_sha,
};
const boundTemplate = structuredClone(template);
boundTemplate.candidate = candidateBinding;

const pending = validatePhysicalQaEvidence(boundTemplate, now, candidateManifest);
assert.equal(pending.overall, 'warn');
assert.equal(pending.release_blocked, true);
assert(pending.pending_cases >= 10);

const passReport = {
  generated_at: '2026-09-07T02:45:00.000Z',
  version: '0.9.0-beta.0',
  platform: 'android',
  native_runtime: true,
  viewport: { width: 412, height: 915, dpr: 2.6 },
  online: true,
  checks: [
    { key: 'staging-project', label: 'Firebase staging', status: 'pass', detail: 'ok' },
    { key: 'v2', label: 'Schema V2', status: 'pass', detail: 'ok' },
    { key: 'auth', label: 'Sesión', status: 'pass', detail: 'ok' },
    { key: 'identity', label: 'Identidad universitaria', status: 'pass', detail: 'ok' },
    { key: 'network', label: 'Conectividad', status: 'pass', detail: 'ok' },
    { key: 'push-permission', label: 'Permiso push', status: 'pass', detail: 'granted' },
    { key: 'app-check', label: 'App Check token', status: 'pass', detail: 'token observado sin exponerlo' },
  ],
  events: [
    { at: '2026-09-07T02:40:00.000Z', kind: 'network_offline', detail: 'seq=1' },
    { at: '2026-09-07T02:41:00.000Z', kind: 'network_online', detail: 'seq=1 duration_ms=60000' },
    { at: '2026-09-07T02:42:00.000Z', kind: 'push_received', detail: 'target=chat correlation=deadbeefcafebabe' },
    { at: '2026-09-07T02:43:00.000Z', kind: 'push_action', detail: 'target=chat correlation=deadbeefcafebabe' },
  ],
};
const good = structuredClone(boundTemplate);
good.device = { label: 'qa-device-a', manufacturer: 'Google', model: 'Pixel-contract', android_version: '15', viewport: '412x915', installation: 'clean', physical: true };
good.required_cases = Object.fromEntries(Object.keys(good.required_cases).map((key) => [key, 'pass']));
good.diagnostic_report = passReport;
const pass = validatePhysicalQaEvidence(good, now, candidateManifest);
assert.equal(pass.overall, 'pass');
assert.equal(pass.release_blocked, false);
assert.equal(pass.candidate_artifact_id, candidateManifest.artifact_id);

const leaked = structuredClone(good);
leaked.password = 'secret';
leaked.diagnostic_report.idToken = 'abc';
const bad = validatePhysicalQaEvidence(leaked, now, candidateManifest);
assert.equal(bad.overall, 'fail');
assert(bad.errors.some((x) => x.includes('password')));
assert(bad.errors.some((x) => x.includes('idToken')));

const explanatory = structuredClone(good);
explanatory.notes = 'No incluir password, idToken, refreshToken ni otros secretos en evidencia.';
assert.equal(validatePhysicalQaEvidence(explanatory, now, candidateManifest).overall, 'pass');

const warned = structuredClone(good);
warned.required_cases.keyboard = 'warn';
const warnResult = validatePhysicalQaEvidence(warned, now, candidateManifest);
assert.equal(warnResult.overall, 'warn');
assert.equal(warnResult.release_blocked, true);

const skipped = structuredClone(good);
skipped.required_cases.push_cold_start = 'not_applicable';
const skippedResult = validatePhysicalQaEvidence(skipped, now, candidateManifest);
assert.equal(skippedResult.overall, 'warn');
assert.equal(skippedResult.release_blocked, true);

const fakePhysical = structuredClone(boundTemplate);
fakePhysical.device.physical = true;
fakePhysical.required_cases = Object.fromEntries(Object.keys(fakePhysical.required_cases).map((key) => [key, 'pass']));
fakePhysical.diagnostic_report = passReport;
const fakeResult = validatePhysicalQaEvidence(fakePhysical, now, candidateManifest);
assert.equal(fakeResult.overall, 'fail');
assert.equal(fakeResult.release_blocked, true);
assert(fakeResult.errors.some((x) => x.includes('placeholder')));

const webReport = structuredClone(good);
webReport.diagnostic_report.platform = 'web';
webReport.diagnostic_report.native_runtime = false;
const webResult = validatePhysicalQaEvidence(webReport, now, candidateManifest);
assert.equal(webResult.overall, 'fail');
assert.equal(webResult.release_blocked, true);

const staleReport = structuredClone(good);
staleReport.diagnostic_report.generated_at = '2026-09-05T00:00:00.000Z';
const staleResult = validatePhysicalQaEvidence(staleReport, now, candidateManifest);
assert.equal(staleResult.overall, 'fail');
assert.equal(staleResult.release_blocked, true);

const wrongVersion = structuredClone(good);
wrongVersion.diagnostic_report.version = '0.8.5-beta.0';
const versionResult = validatePhysicalQaEvidence(wrongVersion, now, candidateManifest);
assert.equal(versionResult.overall, 'fail');

for (const mutate of [
  (x) => { x.candidate.apk_sha256 = '71975f84cd26adb1526db895e76dcb455aed2f258e3f6cf01035c9fd90c95321'; },
  (x) => { x.candidate.artifact_id += 1; },
  (x) => { x.candidate.build_run_id += 1; },
  (x) => { x.candidate.build_commit_sha = '24f733a7ef35b33b9103afa830bef80fa90c3f92'; },
  (x) => { x.candidate.build_tree_sha = '0000000000000000000000000000000000000000'; },
  (x) => { x.candidate.gate_run_id += 1; },
  (x) => { x.candidate.gate_commit_sha = '0'.repeat(40); },
  (x) => { x.candidate.staging_smoke_run_id += 1; },
  (x) => { x.candidate.staging_smoke_commit_sha = '0'.repeat(40); },
]) {
  const oldCandidate = structuredClone(good);
  mutate(oldCandidate);
  const oldResult = validatePhysicalQaEvidence(oldCandidate, now, candidateManifest);
  assert.equal(oldResult.overall, 'fail');
  assert.equal(oldResult.release_blocked, true);
  assert(oldResult.errors.some((x) => x.includes('candidato físico vigente') || x.includes('build_commit_sha')));
}

for (const mutateExpected of [
  (x) => { x.gate_commit_sha = '0'.repeat(40); },
  (x) => { x.staging_smoke_commit_sha = '0'.repeat(40); },
  (x) => { x.candidate_status = 'synthetic_contract_fixture'; },
  (x) => { x.replacement_required = true; },
]) {
  const invalidExpected = structuredClone(candidateManifest);
  mutateExpected(invalidExpected);
  const result = validatePhysicalQaEvidence(good, now, invalidExpected);
  assert.equal(result.overall, 'fail');
  assert(result.errors.some((x) => x.includes('identidad exact-head válida')));
}

const missingCandidate = structuredClone(good);
delete missingCandidate.candidate;
const missingCandidateResult = validatePhysicalQaEvidence(missingCandidate, now, candidateManifest);
assert.equal(missingCandidateResult.overall, 'fail');

console.log('PASS obsolete repository manifest cannot load as an active Physical QA candidate');
console.log('PASS evidence validator uses an explicit synthetic active_exact_head candidate');
console.log('PASS evidence bundles bind APK plus October/staging run IDs and SHAs');
console.log('PASS sensitive, stale, wrong-runtime and wrong-candidate evidence remains fail-closed');
console.log('Physical QA evidence bundle contract: PASS');
