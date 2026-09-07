import fs from 'node:fs';
import assert from 'node:assert/strict';
import { validatePhysicalQaEvidence } from './physical-qa-evidence-bundle.mjs';

const template = JSON.parse(fs.readFileSync('docs/PHYSICAL_QA_EVIDENCE_BUNDLE_0.9.json', 'utf8'));
const pending = validatePhysicalQaEvidence(template);
assert.equal(pending.overall, 'warn');
assert.equal(pending.release_blocked, true);
assert(pending.pending_cases >= 10);

const passReport = {
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
    { at: new Date().toISOString(), kind: 'network_offline', detail: 'seq=1' },
    { at: new Date().toISOString(), kind: 'network_online', detail: 'seq=1 duration_ms=1200' },
    { at: new Date().toISOString(), kind: 'push_received', detail: 'target=chat correlation=deadbeefcafebabe' },
    { at: new Date().toISOString(), kind: 'push_action', detail: 'target=chat correlation=deadbeefcafebabe' },
  ],
};
const good = structuredClone(template);
good.device = { label: 'qa-device-a', manufacturer: 'Synthetic', model: 'Contract', android_version: '15', viewport: '412x915', installation: 'clean', physical: true };
good.required_cases = Object.fromEntries(Object.keys(good.required_cases).map((key) => [key, 'pass']));
good.diagnostic_report = passReport;
const pass = validatePhysicalQaEvidence(good);
assert.equal(pass.overall, 'pass');
assert.equal(pass.release_blocked, false);

const leaked = structuredClone(good);
leaked.password = 'secret';
leaked.diagnostic_report.idToken = 'abc';
const bad = validatePhysicalQaEvidence(leaked);
assert.equal(bad.overall, 'fail');
assert(bad.errors.some((x) => x.includes('password')));
assert(bad.errors.some((x) => x.includes('idToken')));

const explanatory = structuredClone(good);
explanatory.notes = 'No incluir password, idToken, refreshToken ni otros secretos en evidencia.';
assert.equal(validatePhysicalQaEvidence(explanatory).overall, 'pass');

console.log('PASS physical evidence template remains blocked until real evidence exists');
console.log('PASS complete physical evidence can reach PASS');
console.log('PASS sensitive fields fail closed without false-positive explanatory notes');
console.log('Physical QA evidence bundle contract: PASS');
