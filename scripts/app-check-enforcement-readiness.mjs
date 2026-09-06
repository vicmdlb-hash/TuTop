import fs from 'node:fs';
import path from 'node:path';

const MAX_EVIDENCE_AGE_MS = 30 * 24 * 60 * 60_000;

export function validateAppCheckPhysicalEvidence(input, now = Date.now()) {
  const errors = [];
  if (!input || typeof input !== 'object') return { ready: false, errors: ['evidence_missing'] };
  if (input.status !== 'verified') errors.push('status_not_verified');
  if (input.platform !== 'android') errors.push('platform_not_android');
  if (!/^0\.9\.0-beta\./.test(String(input.app_version || ''))) errors.push('app_version_not_0_9_beta');
  if (input.app_check_token_observed !== true) errors.push('app_check_token_not_observed');
  if (input.staging_project !== 'tutop-beta-vicmdlb-1356585881') errors.push('wrong_staging_project');
  if (!Number.isInteger(input.device_count) || input.device_count < 1) errors.push('device_count_missing');
  const verifiedAt = Date.parse(String(input.verified_at || ''));
  if (!Number.isFinite(verifiedAt)) errors.push('verified_at_invalid');
  else if (verifiedAt > now + 5 * 60_000 || now - verifiedAt > MAX_EVIDENCE_AGE_MS) errors.push('evidence_stale_or_future');
  if (input.contains_raw_token === true) errors.push('raw_token_must_not_be_stored');
  return { ready: errors.length === 0, errors };
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
