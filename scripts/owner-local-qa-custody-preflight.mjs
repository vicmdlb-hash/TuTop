/**
 * Owner-only, read-only QA custody inventory. This script never opens a secret,
 * prints a private path, downloads files or claims an APK/release is ready.
 * Safe to run before local signing. Three file-presence checks only.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export function probeOwnerQaCustody({
  platform = process.platform,
  userProfile = process.env.USERPROFILE,
  stat = fs.lstatSync,
} = {}) {
  const result = {
    schema: 'tutop.owner-qa-custody-preflight.v1',
    operation: 'LOCAL_READ_ONLY_FILE_PRESENCE',
    platform_supported: platform === 'win32',
    qa_p12_present: false,
    age_identity_present: false,
    recovery_secret_present: false,
    signing_material_presence_only: false,
    recovery_material_presence_only: false,
    current_apk_proven: false,
    physical_r6_proven: false,
    permission_to_sign_or_restore: false,
  };
  if (platform !== 'win32' || typeof userProfile !== 'string' || !userProfile.trim()) {
    return result;
  }
  const dir = path.win32.join(userProfile, 'TuTop-Private', 'keys');
  const present = (name) => {
    try {
      const info = stat(path.win32.join(dir, name));
      return info.isFile() && !info.isSymbolicLink() && Number.isSafeInteger(info.size) && info.size > 0;
    } catch {
      return false;
    }
  };
  result.qa_p12_present = present('TuTop-QA-ONLY-20261116.p12');
  result.age_identity_present = present('TuTop-age-identity-OWNER-ONLY-20261116.txt');
  result.recovery_secret_present = present('RECOVERY_SECRET_LOCAL_ONLY_20261116.txt');
  result.signing_material_presence_only = result.qa_p12_present && result.age_identity_present;
  result.recovery_material_presence_only = result.recovery_secret_present;
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  // stdout contains only fixed keys and true/false. Never print secret contents,
  // environment values, tool paths, usernames or filesystem error messages.
  console.log(JSON.stringify(probeOwnerQaCustody()));
}
