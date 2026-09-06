export function ciAuthReadiness(env = process.env) {
  const hasShortLived = Boolean(String(env.TUTOP_FIREBASE_ACCESS_TOKEN || '').trim());
  const hasWifCreds = Boolean(String(env.GOOGLE_APPLICATION_CREDENTIALS || env.GOOGLE_GHA_CREDS_PATH || '').trim());
  const hasLegacy = Boolean(String(env.FIREBASE_TOKEN || '').trim());

  if (hasShortLived) return { mode: 'short_lived_access_token', ready: true, migration_ready: true, legacy_fallback_present: hasLegacy };
  if (hasWifCreds) return { mode: 'wif_adc_credentials_present', ready: false, migration_ready: true, legacy_fallback_present: hasLegacy };
  if (hasLegacy) return { mode: 'legacy_firebase_token', ready: true, migration_ready: false, legacy_fallback_present: true };
  return { mode: 'missing', ready: false, migration_ready: false, legacy_fallback_present: false };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = ciAuthReadiness();
  console.log(JSON.stringify(result));
  if (!result.ready && !result.migration_ready) process.exitCode = 2;
}
