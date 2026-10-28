import fs from 'node:fs';
import path from 'node:path';

const MAX_EVIDENCE_AGE_MS = 7 * 24 * 60 * 60_000;
const MIN_DEVICE_COUNT = 2;
const CANDIDATE_MANIFEST_PATH = path.resolve('docs/PHYSICAL_QA_CANDIDATE_0.9.json');
const SHA256 = /^[a-f0-9]{64}$/i;
const GIT_SHA = /^[a-f0-9]{40}$/i;
const ARTIFACT_DIGEST = /^sha256:[a-f0-9]{64}$/i;
// Match semantically sensitive keys across camelCase, snake_case and casing.
// Observation flags such as app_check_token_observed are not raw credentials.
const FORBIDDEN_DEVICE_KEYS = new Set([
  'apikey', 'authorization', 'authorizationheader', 'clientsecret',
  'credentials', 'credential', 'password', 'privatekey',
]);
function sensitiveEvidenceKey(key) {
  const normalized = String(key).replace(/[^a-z0-9]/gi, '').toLowerCase();
  return normalized === 'token' || normalized.endsWith('token') || FORBIDDEN_DEVICE_KEYS.has(normalized);
}

function loadCandidateManifest() {
  if (!fs.existsSync(CANDIDATE_MANIFEST_PATH)) throw new Error('APP_CHECK_CANDIDATE_MANIFEST_MISSING');
  const candidate = JSON.parse(fs.readFileSync(CANDIDATE_MANIFEST_PATH, 'utf8'));
  if (candidate?.schema !== 'tutop.physical-qa-candidate.v1') throw new Error('APP_CHECK_CANDIDATE_MANIFEST_INVALID');
  if (candidate?.physical_release_candidate !== true || candidate?.replacement_required === true) throw new Error('APP_CHECK_CANDIDATE_NOT_ACTIVE');
  return candidate;
}

function placeholder(value) {
  return !String(value || '').trim() || /PENDIENTE|TODO|TBD/i.test(String(value));
}

function hasForbiddenKey(value) {
  if (Array.isArray(value)) return value.some(hasForbiddenKey);
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(([key, child]) => sensitiveEvidenceKey(key) || hasForbiddenKey(child));
}

function freshTimestamp(value, now) {
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) && parsed <= now + 5 * 60_000 && now - parsed <= MAX_EVIDENCE_AGE_MS;
}

export function validateAppCheckPhysicalEvidence(input, now = Date.now(), expectedCandidate = loadCandidateManifest()) {
  const errors = [];
  if (!input || typeof input !== 'object') return { ready: false, errors: ['evidence_missing'] };
  // Evidence is bound to one active signed artifact; generic beta is unsafe.
  const candidate = expectedCandidate || {};
  if (candidate.physical_release_candidate !== true || candidate.replacement_required === true)
    errors.push('candidate_not_active');
  if (!String(candidate.app_version || '').trim()
      || !Number.isSafeInteger(candidate.android_version_code)
      || candidate.android_version_code <= 0
      || candidate.staging_project !== 'tutop-beta-vicmdlb-1356585881'
      || !SHA256.test(String(candidate.apk_sha256 || ''))
      || !SHA256.test(String(candidate.apk_cert_sha256 || ''))
      || !GIT_SHA.test(String(candidate.build_commit_sha || ''))
      || !GIT_SHA.test(String(candidate.build_tree_sha || ''))
      || !Number.isSafeInteger(candidate.artifact_id) || candidate.artifact_id <= 0
      || !Number.isSafeInteger(candidate.build_run_id) || candidate.build_run_id <= 0
      || !String(candidate.artifact_url || '').startsWith('https://')
      || !ARTIFACT_DIGEST.test(String(candidate.artifact_digest || '')))
    errors.push('candidate_provenance_incomplete');
  if (input.status !== 'verified') errors.push('status_not_verified');
  if (input.platform !== 'android') errors.push('platform_not_android');
  if (String(input.app_version || '') !== String(candidate.app_version || '')) errors.push('app_version_candidate_mismatch');
  if (input.android_version_code !== candidate.android_version_code) errors.push('android_version_code_candidate_mismatch');
  if (input.app_check_token_observed !== true) errors.push('app_check_token_not_observed');
  if (input.staging_project !== candidate.staging_project) errors.push('wrong_staging_project');
  if (input.contains_raw_token === true || hasForbiddenKey(input)) errors.push('raw_token_must_not_be_stored');

  const devices = Array.isArray(input.devices) ? input.devices : [];
  if (!Number.isInteger(input.device_count) || input.device_count < MIN_DEVICE_COUNT || input.device_count !== devices.length) errors.push('two_device_evidence_required');
  if (devices.length < MIN_DEVICE_COUNT) errors.push('independent_device_records_required');
  const slots = devices.map((device) => String(device?.slot || ''));
  if (new Set(slots).size !== devices.length || !slots.includes('A') || !slots.includes('B')) errors.push('device_slots_A_B_required');
  const sessions = devices.map((device) => String(device?.evidence_session_id || ''));
  if (sessions.some(placeholder) || new Set(sessions).size !== devices.length) errors.push('independent_evidence_sessions_required');
  const fingerprints = devices.map((device) => String(device?.profile_fingerprint_sha256 || '').toLowerCase());
  if (fingerprints.some((value) => !SHA256.test(value)) || new Set(fingerprints).size !== devices.length) errors.push('independent_device_fingerprints_required');
  devices.forEach((device) => {
    if (device?.physical !== true) errors.push(`device_${String(device?.slot || '?')}_not_physical`);
    if (device?.app_check_token_observed !== true) errors.push(`device_${String(device?.slot || '?')}_token_not_observed`);
    if (!freshTimestamp(device?.verified_at, now)) errors.push(`device_${String(device?.slot || '?')}_evidence_stale_or_future`);
  });

  const verifiedAt = Date.parse(String(input.verified_at || ''));
  if (!Number.isFinite(verifiedAt)) errors.push('verified_at_invalid');
  else if (verifiedAt > now + 5 * 60_000 || now - verifiedAt > MAX_EVIDENCE_AGE_MS) errors.push('evidence_stale_or_future');

  if (input.candidate_apk_sha256 !== candidate.apk_sha256) errors.push('wrong_apk_candidate');
  if (input.candidate_apk_cert_sha256 !== candidate.apk_cert_sha256) errors.push('wrong_apk_cert_candidate');
  if (input.candidate_artifact_id !== candidate.artifact_id) errors.push('wrong_artifact_candidate');
  if (input.candidate_artifact_url !== candidate.artifact_url) errors.push('wrong_artifact_url_candidate');
  if (input.candidate_artifact_digest !== candidate.artifact_digest) errors.push('wrong_artifact_digest_candidate');
  if (input.candidate_build_run_id !== candidate.build_run_id) errors.push('wrong_build_run_candidate');
  if (input.candidate_build_commit_sha !== candidate.build_commit_sha) errors.push('wrong_build_commit_candidate');
  if (input.candidate_build_tree_sha !== candidate.build_tree_sha) errors.push('wrong_build_tree_candidate');

  return {
    ready: errors.length === 0,
    errors,
    min_device_count: MIN_DEVICE_COUNT,
    max_age_days: 7,
    candidate_artifact_id: candidate.artifact_id,
    candidate_apk_sha256: candidate.apk_sha256,
  };
}

export function requireAppCheckPhysicalEvidence(filePath, now = Date.now()) {
  const clean = String(filePath || '').trim();
  if (!clean) throw new Error('APP_CHECK_PHYSICAL_EVIDENCE_REQUIRED');
  const resolved = path.resolve(clean);
  if (!fs.existsSync(resolved)) throw new Error(`APP_CHECK_PHYSICAL_EVIDENCE_NOT_FOUND:${clean}`);
  const parsed = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  const result = validateAppCheckPhysicalEvidence(parsed, now);
  if (!result.ready) throw new Error(`APP_CHECK_PHYSICAL_EVIDENCE_INVALID:${result.errors.join(',')}`);
  return { ...result, path: resolved };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  try {
    const result = requireAppCheckPhysicalEvidence(process.env.TUTOP_APP_CHECK_PHYSICAL_EVIDENCE_PATH);
    console.log(`PASS App Check physical evidence gate: ${result.path}`);
  } catch (error) {
    console.error(`DETENIDO: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(2);
  }
}
