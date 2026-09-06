import assert from 'node:assert/strict';
import { evaluatePhysicalQaReport } from '../src/lib/physicalQaEvaluator.ts';

const base = {
  generated_at: new Date(0).toISOString(),
  version: '0.9.0-beta.0',
  platform: 'android',
  native_runtime: true,
  viewport: { width: 412, height: 915, dpr: 2.6 },
  online: true,
  visibility: 'visible',
  checks: [
    { key: 'staging-project', label: 'Firebase staging', status: 'pass', detail: 'Proyecto staging correcto.' },
    { key: 'v2', label: 'Schema V2', status: 'pass', detail: 'V2 habilitado.' },
    { key: 'auth', label: 'Sesión', status: 'pass', detail: 'Sesión Firebase activa.' },
    { key: 'identity', label: 'Identidad universitaria', status: 'pass', detail: 'Institución y campus hidratados.' },
    { key: 'network', label: 'Conectividad', status: 'pass', detail: 'online' },
    { key: 'push-permission', label: 'Permiso push', status: 'warn', detail: 'Estado: prompt' },
    { key: 'app-check', label: 'App Check token', status: 'warn', detail: 'No se obtuvo token.' },
  ],
  events: [{ at: new Date(0).toISOString(), kind: 'app_boot', detail: '0.9 android' }],
};

const prePush = evaluatePhysicalQaReport(base);
assert.equal(prePush.overall, 'warn');
assert(prePush.score < 100);

const fatal = evaluatePhysicalQaReport({
  ...base,
  checks: base.checks.map((check) => check.key === 'staging-project' ? { ...check, status: 'fail', detail: 'Proyecto inesperado' } : check),
  events: [...base.events, { at: new Date(1).toISOString(), kind: 'unhandled_rejection', detail: 'boom' }],
});
assert.equal(fatal.overall, 'fail');
assert(fatal.findings.some((finding) => finding.code === 'runtime:unhandled-error'));

const passChecks = base.checks.map((check) => check.key === 'push-permission' || check.key === 'app-check' ? { ...check, status: 'pass', detail: 'ok' } : check);
const pushReady = evaluatePhysicalQaReport({
  ...base,
  checks: passChecks,
  events: [
    ...base.events,
    { at: new Date(2).toISOString(), kind: 'network_offline', detail: 'seq=1' },
    { at: new Date(3).toISOString(), kind: 'network_online', detail: 'seq=1 duration_ms=1000' },
    { at: new Date(4).toISOString(), kind: 'push_received', detail: 'target=chat correlation=abc123' },
    { at: new Date(5).toISOString(), kind: 'push_action', detail: 'target=chat correlation=abc123' },
  ],
});
assert.equal(pushReady.overall, 'pass');
assert.equal(pushReady.score, 100);

const mismatch = evaluatePhysicalQaReport({
  ...base,
  checks: passChecks,
  events: [
    ...base.events,
    { at: new Date(2).toISOString(), kind: 'push_received', detail: 'target=listing correlation=one111' },
    { at: new Date(3).toISOString(), kind: 'push_action', detail: 'target=listing correlation=two222' },
  ],
});
assert.equal(mismatch.overall, 'fail');
assert(mismatch.findings.some((finding) => finding.code === 'push:correlation-mismatch'));

const noReconnect = evaluatePhysicalQaReport({
  ...base,
  checks: passChecks,
  events: [...base.events, { at: new Date(2).toISOString(), kind: 'network_offline', detail: 'seq=7' }],
});
assert.equal(noReconnect.overall, 'warn');
assert(noReconnect.findings.some((finding) => finding.code === 'network:no-reconnect-evidence'));

const noTap = evaluatePhysicalQaReport({
  ...base,
  checks: passChecks,
  events: [...base.events, { at: new Date(2).toISOString(), kind: 'push_received', detail: 'target=listing correlation=abc123' }],
});
assert.equal(noTap.overall, 'warn');
assert(noTap.findings.some((finding) => finding.code === 'push:no-tap-evidence'));

console.log('PASS pre-push device classifies as WARN');
console.log('PASS structural/runtime failures classify as FAIL');
console.log('PASS correlated push + reconnect + App Check can classify as PASS');
console.log('PASS mismatched push tap correlation classifies as FAIL');
console.log('PASS missing reconnect evidence remains WARN');
console.log('PASS missing push tap evidence remains WARN');
console.log('Physical QA evaluator scenarios: PASS');
