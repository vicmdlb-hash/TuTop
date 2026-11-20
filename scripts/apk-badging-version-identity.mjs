// Pure Android APK identity checks: never read the device, keystore or Firebase.
// Only parse the 'package:' line emitted by aapt2 dump badging.
export function validateApkVersionCode(value) {
  const raw = typeof value === 'string' ? value : '';
  const code = Number(raw);
  if (!/^\d{1,10}$/.test(raw) || !Number.isSafeInteger(code) || code < 1) {
    throw new Error('APK_VERSION_CODE_INVALID');
  }
  return code;
}

export function validateApkVersionName(value) {
  const raw = typeof value === 'string' ? value : '';
  if (!/^[0-9A-Za-z][0-9A-Za-z.+_-]{0,79}$/.test(raw)) {
    throw new Error('APK_VERSION_NAME_INVALID');
  }
  return raw;
}

export function parseApkBadgingVersionIdentity(badging) {
  if (typeof badging !== 'string') throw new Error('APK_BADGING_INVALID');
  const packageLine = badging.match(/(?:^|\n)package:[^\r\n]*/)?.[0] || '';
  const codes = [...packageLine.matchAll(/\bversionCode='([^']*)'/g)];
  const names = [...packageLine.matchAll(/\bversionName='([^']*)'/g)];
  if (codes.length !== 1) throw new Error('APK_VERSION_CODE_INVALID');
  if (names.length !== 1) throw new Error('APK_VERSION_NAME_INVALID');
  return {
    versionCode: validateApkVersionCode(codes[0][1]),
    versionName: validateApkVersionName(names[0][1]),
  };
}
