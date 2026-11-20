/**
 * Parse the public signer certificate digest from apksigner verify --print-certs.
 * Never echo diagnostic output: it may include a path, device identifier,
 * copied credential, or tool exception in an exportable CI log.
 * An ambiguous signer set cannot safely bind a single Firebase App Check cert.
 */
export function extractApkSignerDigest(output, kind, expectedHexLength) {
  const normalizedKind = typeof kind === 'string'
    ? kind.toUpperCase().replace(/[^A-Z0-9]/g, '') : '';
  const requiredLength = normalizedKind === 'SHA1' ? 40
    : normalizedKind === 'SHA256' ? 64 : 0;
  if (!requiredLength || expectedHexLength !== requiredLength)
    throw Error('APK_CERT_KIND_INVALID');
  if (typeof output !== 'string' || output.length > 256 * 1024)
    throw Error('APK_CERT_OUTPUT_INVALID');

  const observed = new Set();
  for (const line of output.split(/\r?\n/)) {
    const marker = /^\s*Signer\s+#\d+\s+certificate\s+SHA[- ]?\s*(1|256)\s+digest\s*[:=]\s*(.*?)\s*$/i.exec(line);
    if (!marker || 'SHA' + marker[1] !== normalizedKind) continue;
    // After 'digest:', ONLY a canonical hex digest with formatting separators
    // is accepted; stripping arbitrary text could produce a false match.
    const candidate = marker[2];
    if (!/^[0-9a-f:\s-]+$/i.test(candidate)) throw Error('APK_CERT_' + normalizedKind + '_INVALID');
    const hex = candidate.replace(/[:\s-]/g, '').toUpperCase();
    if (!new RegExp('^[0-9A-F]{' + requiredLength + '}$').test(hex))
      throw Error('APK_CERT_' + normalizedKind + '_INVALID');
    observed.add(hex);
    if (observed.size > 1) throw Error('APK_CERT_' + normalizedKind + '_AMBIGUOUS');
  }
  if (observed.size !== 1) throw Error('APK_CERT_' + normalizedKind + '_INVALID');
  return [...observed][0];
}
