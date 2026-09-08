import fs from 'node:fs';
import assert from 'node:assert/strict';
import { validatePhysicalQaEvidence, loadPhysicalQaCandidate } from './physical-qa-evidence-bundle.mjs';

const now = Date.parse('2026-09-07T02:50:00.000Z');
const template = JSON.parse(fs.readFileSync('docs/PHYSICAL_QA_EVIDENCE_BUNDLE_0.9.json', 'utf8'));
const historical = JSON.parse(fs.readFileSync('docs/PHYSICAL_QA_CANDIDATE_0.9.json', 'utf8'));
assert.equal(historical.physical_release_candidate, false);
assert.equal(historical.candidate_status, 'obsolete_runtime_drift');
assert.throws(() => loadPhysicalQaCandidate(), /PHYSICAL_QA_CANDIDATE_NOT_ACTIVE/);

const candidateManifest = {
  ...historical,
  physical_release_candidate: true,
  candidate_status: 'synthetic_contract_fixture',
  replacement_required: false,
};

const pending = validatePhysicalQaEvidence(template, now, candidateManifest);
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
const good = structuredClone(template);
good.device = { label: 'qa-device-a', manufacturer: 'Google', model: 'Pixel-contract', android_version: '15', viewport: '412x915', installation: 'clean', physical: true };
good.required_cases = Object.fromEntries(Object.keys(good.required_cases).map((key) => [key, 'pass']));
good.diagnostic_report = passReport;
const pass = validatePhysicalQaEvidence(good, now, candidateManifest);
assert.equal(pass.overall, 'pass');
assert.equal(pass.release_blocked, false);
assert.equal(pass.candidate_artifact_id, historical.artifact_id);

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

const fakePhysical = structuredClone(template);
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
  (x) => { x.candidate.artifact_id = 10002002950; },
  (x) => { x.candidate.build_run_id = 34075660334; },
  (x) => { x.candidate.build_commit_sha = '24f733a7ef35b33b9103afa830bef80fa90c3f92'; },
  (x) => { x.candidate.build_tree_sha = '0000000000000000000000000000000000000000'; },
]) {
  const oldCandidate = structuredClone(good);
  mutate(oldCandidate);
  const oldResult = validatePhysicalQaEvidence(oldCandidate, now, candidateManifest);
  assert.equal(oldResult.overall, 'fail');
  assert.equal(oldResult.release_blocked, true);
  assert(oldResult.errors.some((x) => x.includes('candidato físico vigente')));
}

const missingCandidate = structuredClone(good);
delete missingCandidate.candidate;
const missingCandidateResult = validatePhysicalQaEvidence(missingCandidate, now, candidateManifest);
assert.equal(missingCandidateResult.overall, 'fail');

console.log('PASS obsolete repository manifest cannot load as an active Physical QA candidate');
console.log('PASS evidence validator remains fully tested with an explicit synthetic active candidate');
console.log('PASS sensitive, stale, wrong-runtime and wrong-candidate evidence remains fail-closed');
console.log('Physical QA evidence bundle contract: PASS');
