import fs from 'node:fs';
import path from 'node:path';

const MAX_EVIDENCE_AGE_MS = 7 * 24 * 60 * 60_000;
const MIN_DEVICE_COUNT = 2;
const CANDIDATE_MANIFEST_PATH = path.resolve('docs/PHYSICAL_QA_CANDIDATE_0.9.json');
const SHA256 = /^[a-f0-9]{64}$/i;
const FORBIDDEN_DEVICE_KEYS = new Set(['token', 'app_check_token', 'raw_token', 'idToken', 'refreshToken']);

function loadCandidateManifest() {
  if (!fs.existsSync(CANDIDATE_MANIFEST_PATH)) throw new Error('APP_CHECK_CANDIDATE_MANIFEST_MISSING');
  const candidate = JSON.parse(fs.readFileSync(CANDIDATE_MANIFEST_PATH, 'utf8'));
  if (candidate?.schema !== 'tutop.physical-qa-candidate.v1') throw new Error('APP_CHECK_CANDIDATE_MANIFEST_INVALID');
  if (candidate?.physical_release_candidate !== true) throw new Error('APP_CHECK_CANDIDATE_NOT_ACTIVE');
  return candidate;
}

function placeholder(value) {
  return !String(value || '').trim() || /PENDIENTE|TODO|TBD/i.test(String(value));
}

function hasForbiddenKey(value) {
  if (Array.isArray(value)) return value.some(hasForbiddenKey);
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(([key, child]) => FORBIDDEN_DEVICE_KEYS.has(key) || hasForbiddenKey(child));
}

function freshTimestamp(value, now) {
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) && parsed <= now + 5 * 60_000 && now - parsed <= MAX_EVIDENCE_AGE_MS;
}

export function validateAppCheckPhysicalEvidence(input, now = Date.now(), expectedCandidate = loadCandidateManifest()) {
  const errors = [];
  if (!input || typeof input !== 'object') return { ready: false, errors: ['evidence_missing'] };
  if (input.status !== 'verified') errors.push('status_not_verified');
  if (input.platform !== 'android') errors.push('platform_not_android');
  if (!/^0\.9\.0-beta\./.test(String(input.app_version || ''))) errors.push('app_version_not_0_9_beta');
  if (input.app_check_token_observed !== true) errors.push('app_check_token_not_observed');
  if (input.staging_project !== 'tutop-beta-vicmdlb-1356585881') errors.push('wrong_staging_project');
  if (input.contains_raw_token === true || hasForbiddenKey(input.devices)) errors.push('raw_token_must_not_be_stored');

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

  if (input.candidate_apk_sha256 !== expectedCandidate.apk_sha256) errors.push('wrong_apk_candidate');
  if (input.candidate_artifact_id !== expectedCandidate.artifact_id) errors.push('wrong_artifact_candidate');
  if (input.candidate_build_run_id !== expectedCandidate.build_run_id) errors.push('wrong_build_run_candidate');
  if (input.candidate_build_tree_sha !== expectedCandidate.build_tree_sha) errors.push('wrong_build_tree_candidate');

  return {
    ready: errors.length === 0,
    errors,
    min_device_count: MIN_DEVICE_COUNT,
    max_age_days: 7,
    candidate_artifact_id: expectedCandidate.artifact_id,
    candidate_apk_sha256: expectedCandidate.apk_sha256,
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
