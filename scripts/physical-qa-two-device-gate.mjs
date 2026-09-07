import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadPhysicalQaCandidate, validatePhysicalQaEvidence } from './physical-qa-evidence-bundle.mjs';

function placeholder(value) {
  return !String(value || '').trim() || /PENDIENTE|TODO|TBD/i.test(String(value));
}

export function validateTwoDeviceEvidence(bundles, now = Date.now(), candidate = loadPhysicalQaCandidate()) {
  const errors = [];
  if (!Array.isArray(bundles) || bundles.length !== 2) {
    return { pass: false, errors: ['se requieren exactamente dos bundles físicos'], assessments: [] };
  }
  const assessments = bundles.map((bundle) => validatePhysicalQaEvidence(bundle, now, candidate));
  assessments.forEach((assessment, index) => {
    if (assessment.release_blocked) errors.push(`Device ${index + 1} todavía está bloqueado por Physical QA`);
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
