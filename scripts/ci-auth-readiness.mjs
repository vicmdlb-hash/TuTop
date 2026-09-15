export function ciAuthReadiness(env = process.env) {
  const hasShortLived = Boolean(String(env.TUTOP_FIREBASE_ACCESS_TOKEN || '').trim());
  const hasWifCreds = Boolean(String(env.GOOGLE_APPLICATION_CREDENTIALS || env.GOOGLE_GHA_CREDS_PATH || '').trim());
  const hasRefreshToken = Boolean(String(env.FIREBASE_TOKEN || '').trim());
  const hasOAuthClientId = Boolean(String(env.TUTOP_FIREBASE_OAUTH_CLIENT_ID || '').trim());
  const hasOAuthClientSecret = Boolean(String(env.TUTOP_FIREBASE_OAUTH_CLIENT_SECRET || '').trim());
  const managedRefreshReady = hasRefreshToken && hasOAuthClientId && hasOAuthClientSecret;
  const managedRefreshPartial = hasRefreshToken && hasOAuthClientId !== hasOAuthClientSecret;
  const cliRefreshReady = hasRefreshToken && !hasOAuthClientId && !hasOAuthClientSecret;

  if (hasShortLived) {
    return { mode: 'short_lived_access_token', ready: true, migration_ready: true, legacy_fallback_present: hasRefreshToken };
  }
  if (managedRefreshReady) {
    return { mode: 'managed_firebase_refresh_token', ready: true, migration_ready: hasWifCreds, legacy_fallback_present: true };
  }
  if (managedRefreshPartial) {
    return { mode: 'refresh_token_partial_oauth_client_credentials', ready: false, migration_ready: hasWifCreds, legacy_fallback_present: true };
  }
  if (cliRefreshReady) {
    return { mode: 'firebase_cli_refresh_token', ready: true, migration_ready: hasWifCreds, legacy_fallback_present: true };
  }
  if (hasWifCreds) {
    return { mode: 'wif_adc_credentials_present', ready: false, migration_ready: true, legacy_fallback_present: false };
  }
  return { mode: 'missing', ready: false, migration_ready: false, legacy_fallback_present: false };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = ciAuthReadiness();
  console.log(JSON.stringify(result));
  if (!result.ready && !result.migration_ready) process.exitCode = 2;
}
