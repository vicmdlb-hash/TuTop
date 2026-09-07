import fs from 'node:fs';
import assert from 'node:assert/strict';
import { validatePhysicalQaEvidence } from './physical-qa-evidence-bundle.mjs';

const now = Date.parse('2026-09-07T02:50:00.000Z');
const template = JSON.parse(fs.readFileSync('docs/PHYSICAL_QA_EVIDENCE_BUNDLE_0.9.json', 'utf8'));
const pending = validatePhysicalQaEvidence(template, now);
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
const pass = validatePhysicalQaEvidence(good, now);
assert.equal(pass.overall, 'pass');
assert.equal(pass.release_blocked, false);

const leaked = structuredClone(good);
leaked.password = 'secret';
leaked.diagnostic_report.idToken = 'abc';
const bad = validatePhysicalQaEvidence(leaked, now);
assert.equal(bad.overall, 'fail');
assert(bad.errors.some((x) => x.includes('password')));
assert(bad.errors.some((x) => x.includes('idToken')));

const explanatory = structuredClone(good);
explanatory.notes = 'No incluir password, idToken, refreshToken ni otros secretos en evidencia.';
assert.equal(validatePhysicalQaEvidence(explanatory, now).overall, 'pass');

// Required cases cannot be waved through as WARN or NOT_APPLICABLE.
const warned = structuredClone(good);
warned.required_cases.keyboard = 'warn';
const warnResult = validatePhysicalQaEvidence(warned, now);
assert.equal(warnResult.overall, 'warn');
assert.equal(warnResult.release_blocked, true);
assert.equal(warnResult.warning_cases, 1);

const skipped = structuredClone(good);
skipped.required_cases.push_cold_start = 'not_applicable';
const skippedResult = validatePhysicalQaEvidence(skipped, now);
assert.equal(skippedResult.overall, 'warn');
assert.equal(skippedResult.release_blocked, true);
assert.equal(skippedResult.not_applicable_cases, 1);

// Simply toggling physical=true on the template must never create valid evidence.
const fakePhysical = structuredClone(template);
fakePhysical.device.physical = true;
fakePhysical.required_cases = Object.fromEntries(Object.keys(fakePhysical.required_cases).map((key) => [key, 'pass']));
fakePhysical.diagnostic_report = passReport;
const fakeResult = validatePhysicalQaEvidence(fakePhysical, now);
assert.equal(fakeResult.overall, 'fail');
assert.equal(fakeResult.release_blocked, true);
assert(fakeResult.errors.some((x) => x.includes('placeholder')));

const webReport = structuredClone(good);
webReport.diagnostic_report.platform = 'web';
webReport.diagnostic_report.native_runtime = false;
const webResult = validatePhysicalQaEvidence(webReport, now);
assert.equal(webResult.overall, 'fail');
assert.equal(webResult.release_blocked, true);
assert(webResult.errors.some((x) => x.includes('platform')));

const staleReport = structuredClone(good);
staleReport.diagnostic_report.generated_at = '2026-09-05T00:00:00.000Z';
const staleResult = validatePhysicalQaEvidence(staleReport, now);
assert.equal(staleResult.overall, 'fail');
assert.equal(staleResult.release_blocked, true);
assert(staleResult.errors.some((x) => x.includes('24 h')));

const wrongVersion = structuredClone(good);
wrongVersion.diagnostic_report.version = '0.8.5-beta.0';
const versionResult = validatePhysicalQaEvidence(wrongVersion, now);
assert.equal(versionResult.overall, 'fail');
assert(versionResult.errors.some((x) => x.includes('version')));

console.log('PASS physical evidence template remains blocked until real evidence exists');
console.log('PASS complete fresh native Android evidence can reach PASS');
console.log('PASS sensitive fields fail closed without false-positive explanatory notes');
console.log('PASS WARN/NOT_APPLICABLE required cases cannot produce false release PASS');
console.log('PASS physical=true cannot bypass placeholder device metadata');
console.log('PASS stale, web/non-native, and wrong-version diagnostics cannot unlock release');
console.log('Physical QA evidence bundle contract: PASS');
