import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { evaluatePhysicalQaReport } from '../src/lib/physicalQaEvaluator.ts';

const requiredCases = [
  'install_boot','auth_identity','reinstall_identity','keyboard','android_back','lifecycle','safe_areas','rotation',
  'offline_reconnect','push_foreground','push_background','push_cold_start','push_deep_link','app_check_token_observed',
];
const allowedCase = new Set(['pass','warn','fail','pending','not_applicable']);
const forbiddenKeys = new Set(['refreshToken','idToken','password','FIREBASE_TOKEN']);

function scanSensitive(value, errors, pathParts = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanSensitive(item, errors, [...pathParts, String(index)]));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (forbiddenKeys.has(key)) errors.push(`dato prohibido detectado en campo: ${[...pathParts, key].join('.')}`);
      scanSensitive(child, errors, [...pathParts, key]);
    }
    return;
  }
  if (typeof value !== 'string') return;
  // Human notes may name forbidden concepts (e.g. "no incluir password") without
  // containing the secret itself. Values are inspected for token/phone-like payloads,
  // while exact forbidden field names are rejected structurally above.
  if (/\b\d{10,13}\b/.test(value)) errors.push(`posible número telefónico/identificador sensible sin redactar en ${pathParts.join('.') || 'root'}`);
  if (/[A-Za-z0-9_-]{120,}/.test(value)) errors.push(`posible token/identificador largo sin redactar en ${pathParts.join('.') || 'root'}`);
}

export function validatePhysicalQaEvidence(bundle) {
  const errors = [];
  const warnings = [];
  if (bundle?.schema !== 'tutop.physical-qa-evidence.v1') errors.push('schema inválido');
  if (bundle?.app_version !== '0.9.0-beta.0') errors.push('app_version debe ser 0.9.0-beta.0');
  if (bundle?.environment !== 'staging') errors.push('environment debe ser staging');
  if (!bundle?.device || typeof bundle.device !== 'object') errors.push('device requerido');
  if (bundle?.device?.physical !== true) warnings.push('evidencia todavía no proviene de dispositivo físico real');
  for (const key of requiredCases) {
    const value = bundle?.required_cases?.[key];
    if (!allowedCase.has(value)) errors.push(`required_cases.${key} inválido`);
  }
  scanSensitive(bundle || {}, errors);

  let assessment = null;
  if (bundle?.diagnostic_report) {
    try { assessment = evaluatePhysicalQaReport(bundle.diagnostic_report); }
    catch (error) { errors.push(`diagnostic_report inválido: ${error instanceof Error ? error.message : String(error)}`); }
  } else {
    warnings.push('diagnostic_report todavía no adjunto');
  }

  const caseValues = Object.values(bundle?.required_cases || {});
  const failedCases = caseValues.filter((value) => value === 'fail').length;
  const pendingCases = caseValues.filter((value) => value === 'pending').length;
  const overall = errors.length || failedCases || assessment?.overall === 'fail' ? 'fail'
    : warnings.length || pendingCases || assessment?.overall === 'warn' ? 'warn' : 'pass';
  const releaseBlocked = overall !== 'pass' || bundle?.device?.physical !== true || pendingCases > 0;
  return { overall, release_blocked: releaseBlocked, errors, warnings, failed_cases: failedCases, pending_cases: pendingCases, assessment };
}

function main() {
  const args = process.argv.slice(2);
  const file = args.find((arg) => !arg.startsWith('--'));
  if (!file) {
    console.error('Uso: node --experimental-strip-types scripts/physical-qa-evidence-bundle.mjs <evidence.json> [--json]');
    process.exit(2);
  }
  const bundle = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
  const result = validatePhysicalQaEvidence(bundle);
  console.log(args.includes('--json') ? JSON.stringify(result, null, 2) : [
    `Physical QA evidence: ${result.overall.toUpperCase()}`,
    `release_blocked=${result.release_blocked}`,
    `failed_cases=${result.failed_cases}`,
    `pending_cases=${result.pending_cases}`,
    ...result.errors.map((x) => `ERROR ${x}`),
    ...result.warnings.map((x) => `WARN ${x}`),
  ].join('\n'));
  if (result.errors.length) process.exitCode = 2;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) main();
