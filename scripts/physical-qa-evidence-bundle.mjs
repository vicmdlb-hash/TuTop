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
const requiredDeviceFields = ['label','manufacturer','model','android_version','viewport','installation'];
const requiredCandidateFields = ['artifact_name','artifact_id','build_run_id','build_commit_sha','build_tree_sha','apk_sha256'];
const MAX_DIAGNOSTIC_AGE_MS = 24 * 60 * 60_000;
const CANDIDATE_MANIFEST_PATH = path.resolve('docs/PHYSICAL_QA_CANDIDATE_0.9.json');

export function loadPhysicalQaCandidate() {
  if (!fs.existsSync(CANDIDATE_MANIFEST_PATH)) throw new Error('PHYSICAL_QA_CANDIDATE_MANIFEST_MISSING');
  const candidate = JSON.parse(fs.readFileSync(CANDIDATE_MANIFEST_PATH, 'utf8'));
  if (candidate?.schema !== 'tutop.physical-qa-candidate.v1') throw new Error('PHYSICAL_QA_CANDIDATE_SCHEMA_INVALID');
  if (candidate?.app_version !== '0.9.0-beta.0') throw new Error('PHYSICAL_QA_CANDIDATE_VERSION_INVALID');
  if (candidate?.environment !== 'staging') throw new Error('PHYSICAL_QA_CANDIDATE_ENVIRONMENT_INVALID');
  if (candidate?.physical_release_candidate !== true) throw new Error('PHYSICAL_QA_CANDIDATE_NOT_ACTIVE');
  return candidate;
}

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

function isPlaceholder(value) {
  const text = String(value || '').trim();
  return !text || /PENDIENTE|TODO|TBD/i.test(text) || text.includes('|');
}

function validateCandidateBinding(bundle, expectedCandidate, errors) {
  if (!bundle?.candidate || typeof bundle.candidate !== 'object') {
    errors.push('candidate requerido para ligar evidencia al APK exacto');
    return;
  }
  for (const field of requiredCandidateFields) {
    if (bundle.candidate[field] !== expectedCandidate[field]) {
      errors.push(`candidate.${field} no coincide con el candidato físico vigente`);
    }
  }
  if (bundle.candidate.apk_sha256 && !/^[a-f0-9]{64}$/.test(String(bundle.candidate.apk_sha256))) {
    errors.push('candidate.apk_sha256 inválido');
  }
}

function validateFreshNativeDiagnostic(bundle, errors, now = Date.now()) {
  const report = bundle?.diagnostic_report;
  if (!report) return;
  if (report.version !== bundle.app_version) errors.push('diagnostic_report.version no coincide con app_version');
  if (report.platform !== 'android') errors.push('diagnostic_report.platform debe ser android');
  if (report.native_runtime !== true) errors.push('diagnostic_report debe provenir de runtime Android nativo');
  const generatedAt = Date.parse(String(report.generated_at || ''));
  if (!Number.isFinite(generatedAt)) errors.push('diagnostic_report.generated_at inválido');
  else if (generatedAt > now + 5 * 60_000 || now - generatedAt > MAX_DIAGNOSTIC_AGE_MS) errors.push('diagnostic_report fuera de ventana fresca de 24 h');
}

export function validatePhysicalQaEvidence(bundle, now = Date.now(), expectedCandidate = loadPhysicalQaCandidate()) {
  const errors = [];
  const warnings = [];
  if (bundle?.schema !== 'tutop.physical-qa-evidence.v1') errors.push('schema inválido');
  if (bundle?.app_version !== '0.9.0-beta.0') errors.push('app_version debe ser 0.9.0-beta.0');
  if (bundle?.environment !== 'staging') errors.push('environment debe ser staging');
  validateCandidateBinding(bundle, expectedCandidate, errors);
  if (!bundle?.device || typeof bundle.device !== 'object') errors.push('device requerido');
  if (bundle?.device?.physical !== true) warnings.push('evidencia todavía no proviene de dispositivo físico real');
  if (bundle?.device?.physical === true) {
    for (const field of requiredDeviceFields) {
      if (isPlaceholder(bundle?.device?.[field])) errors.push(`device.${field} debe contener evidencia real, no placeholder`);
    }
  }
  for (const key of requiredCases) {
    const value = bundle?.required_cases?.[key];
    if (!allowedCase.has(value)) errors.push(`required_cases.${key} inválido`);
  }
  scanSensitive(bundle || {}, errors);
  if (bundle?.device?.physical === true) validateFreshNativeDiagnostic(bundle, errors, now);

  let assessment = null;
  if (bundle?.diagnostic_report) {
    try { assessment = evaluatePhysicalQaReport(bundle.diagnostic_report); }
    catch (error) { errors.push(`diagnostic_report inválido: ${error instanceof Error ? error.message : String(error)}`); }
  } else {
    warnings.push('diagnostic_report todavía no adjunto');
  }

  const caseValues = requiredCases.map((key) => bundle?.required_cases?.[key]);
  const failedCases = caseValues.filter((value) => value === 'fail').length;
  const pendingCases = caseValues.filter((value) => value === 'pending').length;
  const warningCases = caseValues.filter((value) => value === 'warn').length;
  const notApplicableCases = caseValues.filter((value) => value === 'not_applicable').length;
  const incompleteCases = caseValues.filter((value) => value !== 'pass').length;
  if (warningCases) warnings.push(`${warningCases} caso(s) obligatorio(s) siguen en WARN`);
  if (notApplicableCases) warnings.push(`${notApplicableCases} caso(s) obligatorio(s) fueron marcados NOT_APPLICABLE y requieren resolución`);

  const overall = errors.length || failedCases || assessment?.overall === 'fail' ? 'fail'
    : warnings.length || pendingCases || warningCases || notApplicableCases || assessment?.overall === 'warn' ? 'warn' : 'pass';
  const releaseBlocked = overall !== 'pass'
    || bundle?.device?.physical !== true
    || incompleteCases > 0
    || assessment?.overall !== 'pass';
  return {
    overall,
    release_blocked: releaseBlocked,
    errors,
    warnings,
    failed_cases: failedCases,
    pending_cases: pendingCases,
    warning_cases: warningCases,
    not_applicable_cases: notApplicableCases,
    incomplete_cases: incompleteCases,
    candidate_apk_sha256: expectedCandidate.apk_sha256,
    candidate_artifact_id: expectedCandidate.artifact_id,
    assessment,
  };
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
    `candidate_artifact_id=${result.candidate_artifact_id}`,
    `candidate_apk_sha256=${result.candidate_apk_sha256}`,
    `failed_cases=${result.failed_cases}`,
    `pending_cases=${result.pending_cases}`,
    `warning_cases=${result.warning_cases}`,
    `not_applicable_cases=${result.not_applicable_cases}`,
    `incomplete_cases=${result.incomplete_cases}`,
    ...result.errors.map((x) => `ERROR ${x}`),
    ...result.warnings.map((x) => `WARN ${x}`),
  ].join('\n'));
  if (result.errors.length) process.exitCode = 2;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) main();
