import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadPhysicalQaCandidate, validatePhysicalQaEvidence } from './physical-qa-evidence-bundle.mjs';
import { validateFcmPhysicalFixture } from './fcm-physical-fixture-validator.mjs';

const MAX_SESSION_MS = 6 * 60 * 60_000;
const MAX_EVIDENCE_AGE_MS = 24 * 60 * 60_000;
const CLOCK_SKEW_MS = 5 * 60_000;
const SHA256 = /^[a-f0-9]{64}$/i;
const VISUAL_CASES = ['keyboard', 'safe_areas', 'rotation'];
const FCM_CORRELATION_EVENTS = new Set(['push_received', 'push_action', 'route_opened']);

function placeholder(value) {
  return !String(value || '').trim() || /PENDIENTE|TODO|TBD/i.test(String(value));
}

function parseTimestamp(value) {
  if (placeholder(value)) return NaN;
  return Date.parse(String(value));
}

function validateScreenshots(bundle, index, started, completed, errors) {
  const label = `Device ${index + 1}`;
  const screenshots = Array.isArray(bundle?.screenshots) ? bundle.screenshots : [];
  const hashes = [];
  for (const shot of screenshots) {
    const sha = String(shot?.sha256 || '').toLowerCase();
    const capturedAt = Date.parse(String(shot?.captured_at || ''));
    const caseName = String(shot?.case || '');
    if (!SHA256.test(sha)) errors.push(`${label}: screenshot.sha256 inválido o placeholder`);
    else hashes.push(sha);
    if (!VISUAL_CASES.includes(caseName)) errors.push(`${label}: screenshot.case debe ser keyboard, safe_areas o rotation`);
    if (!Number.isFinite(capturedAt)) errors.push(`${label}: screenshot.captured_at inválido`);
    else if (capturedAt < started - CLOCK_SKEW_MS || capturedAt > completed + CLOCK_SKEW_MS) {
      errors.push(`${label}: screenshot capturado fuera de la sesión de evidencia`);
    }
  }
  if (new Set(hashes).size !== hashes.length) errors.push(`${label}: screenshot SHA-256 reutilizado dentro del mismo bundle`);
  for (const requiredCase of VISUAL_CASES) {
    if (!screenshots.some((shot) => shot?.case === requiredCase && SHA256.test(String(shot?.sha256 || '')))) {
      errors.push(`${label}: falta screenshot verificable para ${requiredCase}`);
    }
  }
  return new Set(hashes);
}

function collectFcmCorrelations(bundle) {
  const correlations = new Set();
  const scenarios = Array.isArray(bundle?.fcm_fixture_report?.scenarios) ? bundle.fcm_fixture_report.scenarios : [];
  for (const scenario of scenarios) {
    const events = Array.isArray(scenario?.events) ? scenario.events : [];
    for (const event of events) {
      if (!FCM_CORRELATION_EVENTS.has(event?.kind)) continue;
      const correlation = String(event?.correlation || '').trim();
      if (correlation) correlations.add(correlation);
    }
  }
  return correlations;
}

function validateLinkedEvidence(bundle, index, started, completed, now, candidate, errors) {
  const label = `Device ${index + 1}`;
  const slot = String(bundle?.device?.slot || '');
  const session = String(bundle?.evidence_session_id || '');

  const fcm = bundle?.fcm_fixture_report;
  if (!fcm || typeof fcm !== 'object') errors.push(`${label}: fcm_fixture_report requerido para cerrar push físico`);
  else {
    if (String(fcm.device_slot || '') !== slot) errors.push(`${label}: FCM device_slot no coincide con bundle`);
    if (String(fcm.evidence_session_id || '') !== session) errors.push(`${label}: FCM evidence_session_id no coincide con bundle`);
    if (String(fcm.evidence_started_at || '') !== String(bundle.evidence_started_at || '')) errors.push(`${label}: FCM evidence_started_at no coincide con bundle`);
    if (String(fcm.evidence_completed_at || '') !== String(bundle.evidence_completed_at || '')) errors.push(`${label}: FCM evidence_completed_at no coincide con bundle`);
    const fcmResult = validateFcmPhysicalFixture(fcm, candidate, now);
    for (const error of fcmResult.errors) errors.push(`${label}: FCM ${error}`);
  }

  const appCheck = bundle?.app_check_evidence;
  if (!appCheck || typeof appCheck !== 'object') errors.push(`${label}: app_check_evidence individual requerida`);
  else {
    if (appCheck.observed !== true) errors.push(`${label}: App Check no fue observado`);
    if (String(appCheck.device_slot || '') !== slot) errors.push(`${label}: App Check device_slot no coincide con bundle`);
    if (String(appCheck.evidence_session_id || '') !== session) errors.push(`${label}: App Check evidence_session_id no coincide con bundle`);
    if (appCheck.candidate_apk_sha256 !== candidate.apk_sha256) errors.push(`${label}: App Check ligado a APK incorrecta`);
    if (appCheck.contains_raw_token === true || 'token' in appCheck || 'app_check_token' in appCheck) {
      errors.push(`${label}: App Check no debe almacenar token crudo`);
    }
    const observedAt = Date.parse(String(appCheck.observed_at || ''));
    if (!Number.isFinite(observedAt)) errors.push(`${label}: App Check observed_at inválido`);
    else if (observedAt < started - CLOCK_SKEW_MS || observedAt > completed + CLOCK_SKEW_MS) {
      errors.push(`${label}: App Check observado fuera de la sesión de evidencia`);
    }
  }
}

function validateSessionWindow(bundle, index, now, candidate, errors) {
  const label = `Device ${index + 1}`;
  const started = parseTimestamp(bundle?.evidence_started_at);
  const completed = parseTimestamp(bundle?.evidence_completed_at);
  if (!Number.isFinite(started)) errors.push(`${label}: evidence_started_at ISO-8601 real requerido`);
  if (!Number.isFinite(completed)) errors.push(`${label}: evidence_completed_at ISO-8601 real requerido`);
  if (!Number.isFinite(started) || !Number.isFinite(completed)) return new Set();
  if (completed <= started) errors.push(`${label}: la sesión debe terminar después de iniciar`);
  if (completed - started > MAX_SESSION_MS) errors.push(`${label}: sesión física excede 6 horas; dividir evidencia`);
  if (completed > now + CLOCK_SKEW_MS) errors.push(`${label}: evidencia_completed_at está en el futuro`);
  if (now - completed > MAX_EVIDENCE_AGE_MS) errors.push(`${label}: evidencia física supera 24 horas de antigüedad`);

  const reportAt = Date.parse(String(bundle?.diagnostic_report?.generated_at || ''));
  if (Number.isFinite(reportAt) && (reportAt < started - CLOCK_SKEW_MS || reportAt > completed + CLOCK_SKEW_MS)) {
    errors.push(`${label}: diagnostic_report.generated_at cae fuera de la sesión de evidencia`);
  }
  let previous = -Infinity;
  for (const event of bundle?.diagnostic_report?.events || []) {
    const eventAt = Date.parse(String(event?.at || ''));
    if (!Number.isFinite(eventAt)) {
      errors.push(`${label}: evento diagnóstico con timestamp inválido`);
      continue;
    }
    if (eventAt < previous) errors.push(`${label}: eventos diagnóstico fuera de orden temporal`);
    previous = eventAt;
    if (eventAt < started - CLOCK_SKEW_MS || eventAt > completed + CLOCK_SKEW_MS) {
      errors.push(`${label}: evento diagnóstico fuera de la sesión de evidencia`);
    }
  }
  const screenshotHashes = validateScreenshots(bundle, index, started, completed, errors);
  validateLinkedEvidence(bundle, index, started, completed, now, candidate, errors);
  return screenshotHashes;
}

export function validateTwoDeviceEvidence(bundles, now = Date.now(), candidate = loadPhysicalQaCandidate()) {
  const errors = [];
  if (!Array.isArray(bundles) || bundles.length !== 2) {
    return { pass: false, errors: ['se requieren exactamente dos bundles físicos'], assessments: [] };
  }
  const assessments = bundles.map((bundle) => validatePhysicalQaEvidence(bundle, now, candidate));
  const screenshotSets = [];
  assessments.forEach((assessment, index) => {
    if (assessment.release_blocked) errors.push(`Device ${index + 1} todavía está bloqueado por Physical QA`);
    screenshotSets.push(validateSessionWindow(bundles[index], index, now, candidate, errors));
  });
  const slots = bundles.map((bundle) => String(bundle?.device?.slot || ''));
  if (new Set(slots).size !== 2 || !slots.includes('A') || !slots.includes('B')) errors.push('los bundles deben usar slots A y B distintos');
  const sessions = bundles.map((bundle) => String(bundle?.evidence_session_id || ''));
  if (sessions.some(placeholder) || new Set(sessions).size !== 2) errors.push('cada dispositivo requiere evidence_session_id real y único');
  const fingerprints = bundles.map((bundle) => [
    bundle?.device?.manufacturer,
    bundle?.device?.model,
    bundle?.device?.android_version,
    bundle?.device?.viewport,
  ].map((value) => String(value || '').trim().toLowerCase()).join('|'));
  if (fingerprints.some((value) => placeholder(value)) || new Set(fingerprints).size !== 2) {
    errors.push('Device A y Device B deben representar perfiles físicos distintos');
  }
  const crossDeviceDuplicates = [...screenshotSets[0]].filter((sha) => screenshotSets[1].has(sha));
  if (crossDeviceDuplicates.length) errors.push('Device A y Device B reutilizan screenshot SHA-256; la evidencia debe ser independiente');
  const fcmCorrelationSets = bundles.map(collectFcmCorrelations);
  const crossDeviceFcmReplay = [...fcmCorrelationSets[0]].filter((correlation) => fcmCorrelationSets[1].has(correlation));
  if (crossDeviceFcmReplay.length) {
    errors.push('Device A y Device B reutilizan correlaciones FCM; la evidencia push debe ser independiente por dispositivo');
  }
  return { pass: errors.length === 0, errors, assessments };
}

function main() {
  const files = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
  if (files.length !== 2) {
    console.error('Uso: node --experimental-strip-types scripts/physical-qa-two-device-gate.mjs <device-a.json> <device-b.json> [--json]');
    process.exit(2);
  }
  const bundles = files.map((file) => JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
  const result = validateTwoDeviceEvidence(bundles);
  console.log(process.argv.includes('--json') ? JSON.stringify(result, null, 2) : [
    `Two-device Physical QA: ${result.pass ? 'PASS' : 'BLOCKED'}`,
    ...result.errors.map((error) => `ERROR ${error}`),
  ].join('\n'));
  if (!result.pass) process.exitCode = 2;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) main();
