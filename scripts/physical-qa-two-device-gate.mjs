import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadPhysicalQaCandidate, validatePhysicalQaEvidence } from './physical-qa-evidence-bundle.mjs';

const MAX_SESSION_MS = 6 * 60 * 60_000;
const MAX_EVIDENCE_AGE_MS = 24 * 60 * 60_000;
const CLOCK_SKEW_MS = 5 * 60_000;

function placeholder(value) {
  return !String(value || '').trim() || /PENDIENTE|TODO|TBD/i.test(String(value));
}

function parseTimestamp(value) {
  if (placeholder(value)) return NaN;
  return Date.parse(String(value));
}

function validateSessionWindow(bundle, index, now, errors) {
  const label = `Device ${index + 1}`;
  const started = parseTimestamp(bundle?.evidence_started_at);
  const completed = parseTimestamp(bundle?.evidence_completed_at);
  if (!Number.isFinite(started)) errors.push(`${label}: evidence_started_at ISO-8601 real requerido`);
  if (!Number.isFinite(completed)) errors.push(`${label}: evidence_completed_at ISO-8601 real requerido`);
  if (!Number.isFinite(started) || !Number.isFinite(completed)) return;
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
}

export function validateTwoDeviceEvidence(bundles, now = Date.now(), candidate = loadPhysicalQaCandidate()) {
  const errors = [];
  if (!Array.isArray(bundles) || bundles.length !== 2) {
    return { pass: false, errors: ['se requieren exactamente dos bundles físicos'], assessments: [] };
  }
  const assessments = bundles.map((bundle) => validatePhysicalQaEvidence(bundle, now, candidate));
  assessments.forEach((assessment, index) => {
    if (assessment.release_blocked) errors.push(`Device ${index + 1} todavía está bloqueado por Physical QA`);
    validateSessionWindow(bundles[index], index, now, errors);
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
  return { pass: errors.length === 0, errors, assessments };
}

function main() {
  const files = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
  if (files.length !== 2) {
    console.error('Uso: node --experimental-strip-types scripts/physical-qa-two-device-gate.mjs <device-a.json> <device-b.json> [--json]');
    process.exit(2);
  }
  const bundles = files.map((file) => JSON.parse(fs.readFileSync(path.resolve(file), 'utf8')));
  const result = validateTwoDeviceEvidence(bundles);
  console.log(process.argv.includes('--json') ? JSON.stringify(result, null, 2) : [
    `Two-device Physical QA: ${result.pass ? 'PASS' : 'BLOCKED'}`,
    ...result.errors.map((error) => `ERROR ${error}`),
  ].join('\n'));
  if (!result.pass) process.exitCode = 2;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) main();
