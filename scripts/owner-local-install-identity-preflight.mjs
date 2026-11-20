/** Pure, owner-declared metadata comparison. Never opens ADB, APKs, keys or devices.
 * An outcome here cannot authorize install, override Android or prove physical R6.
 */
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const PACKAGE = 'mx.tutop.app';
const SCHEMA = 'tutop.owner-install-metadata-preflight.v1';
const VERSION_CODE = /^[0-9]{1,10}$/;
const SHA256 = /^[0-9a-f]{64}$/;

function code(value) {
  const raw = typeof value === 'number' || typeof value === 'string' ? String(value) : '';
  if (!VERSION_CODE.test(raw)) return null;
  const number = Number(raw);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}
function cert(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/:/g, '').toLowerCase();
  return SHA256.test(normalized) ? normalized : null;
}

/** Returns conservative facts only about caller-supplied metadata.
 * Android can allow an equal versionCode; this QA policy deliberately holds
 * equal-code replacements to prevent silently overwriting unrelated betas.
 * Rotation proof is NOT evaluated here: unequal signers require manual review.
 */
export function assessOwnerLocalInstallMetadata(input = {}) {
  const base = {
    schema: SCHEMA,
    operation: 'DECLARED_METADATA_ONLY_NO_ADB',
    comparison_passed: false,
    permission_to_install: false,
    candidate_apk_verified: false,
    device_inventory_verified: false,
    physical_r6_passed: false,
    release_allowed: false,
  };
  const fail = reason => ({ ...base, reason });
  if (!input || typeof input !== 'object' || Array.isArray(input)) return fail('INPUT_INVALID');
  if (input.candidatePackage !== PACKAGE) return fail('CANDIDATE_PACKAGE_UNKNOWN_OR_INVALID');
  const newCode = code(input.candidateVersionCode);
  if (newCode === null) return fail('CANDIDATE_VERSION_CODE_UNKNOWN_OR_INVALID');
  if (input.installedState === 'absent') return fail('NO_INSTALLED_COMPARISON_PHYSICAL_ABSENCE_UNVERIFIED');
  if (input.installedState !== 'present') return fail('INSTALLED_STATE_UNKNOWN');
  if (input.installedPackage !== PACKAGE) return fail('INSTALLED_PACKAGE_UNKNOWN_OR_MISMATCH');
  const oldCode = code(input.installedVersionCode);
  if (oldCode === null) return fail('INSTALLED_VERSION_CODE_UNKNOWN_OR_INVALID');
  if (newCode < oldCode) return fail('DOWNGRADE_BLOCKED');
  if (newCode === oldCode) return fail('SAME_CODE_REQUIRES_SEPARATE_QA_REVIEW');
  const oldCert = cert(input.installedCertSha256);
  const newCert = cert(input.candidateCertSha256);
  if (!oldCert || !newCert) return fail('CERTIFICATE_METADATA_UNKNOWN_OR_INVALID');
  if (oldCert !== newCert) return fail('SIGNER_MISMATCH_OR_ROTATION_UNVERIFIED');
  return {
    ...base,
    comparison_passed: true,
    reason: 'VERSION_AND_CERT_METADATA_MATCH_CLAIM_ONLY_REQUIRES_DEVICE_AND_APK_PROOF',
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  // Never emit paths, signer digests, environment contents or device identifiers.
  console.log(JSON.stringify(assessOwnerLocalInstallMetadata({
    candidatePackage: process.env.TUTOP_QA_CANDIDATE_PACKAGE,
    candidateVersionCode: process.env.TUTOP_QA_CANDIDATE_VERSION_CODE,
    candidateCertSha256: process.env.TUTOP_QA_CANDIDATE_CERT_SHA256,
    installedState: process.env.TUTOP_QA_INSTALLED_STATE,
    installedPackage: process.env.TUTOP_QA_INSTALLED_PACKAGE,
    installedVersionCode: process.env.TUTOP_QA_INSTALLED_VERSION_CODE,
    installedCertSha256: process.env.TUTOP_QA_INSTALLED_CERT_SHA256,
  })));
}
