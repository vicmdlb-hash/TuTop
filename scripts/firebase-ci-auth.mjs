import './dangerous-script-apply-guard.mjs';

const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

// firebase-tools@15.29.0 uses an OAuth "installed application" client. Google
// explicitly treats this class of client secret as public metadata, not as a
// confidential server secret. Keeping the same pinned fallback lets a
// FIREBASE_TOKEN created by `firebase login:ci` work on a fresh GitHub-hosted
// runner without depending on Víctor's laptop/ADC. Explicit managed credentials
// still take precedence when both are configured.
// Source of truth: firebase/firebase-tools v15.29.0 src/api.ts.
const FIREBASE_CLI_OAUTH_CLIENT_ID = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com';
const FIREBASE_CLI_OAUTH_CLIENT_SECRET = 'j9iVZfS8kkCEFUPaAeJV0sAi';

function redactOAuthDetail(input = '') {
  return String(input)
    .replace(/("(?:access_token|refresh_token|id_token|assertion|client_secret)"\s*:\s*")[^"]+("?)/gi, '$1[REDACTED]$2')
    .replace(/((?:access_token|refresh_token|id_token|assertion|client_secret)=)[^&\s]+/gi, '$1[REDACTED]')
    .slice(0, 500);
}

export async function firebaseCiAccessToken() {
  const explicit = String(process.env.TUTOP_FIREBASE_ACCESS_TOKEN || '').trim();
  if (explicit) return explicit;

  const refreshToken = String(process.env.FIREBASE_TOKEN || '').trim();
  if (!refreshToken) {
    throw new Error('Falta FIREBASE_TOKEN o TUTOP_FIREBASE_ACCESS_TOKEN para obtener un access token de Google.');
  }

  const managedClientId = String(process.env.TUTOP_FIREBASE_OAUTH_CLIENT_ID || '').trim();
  const managedClientSecret = String(process.env.TUTOP_FIREBASE_OAUTH_CLIENT_SECRET || '').trim();
  if (Boolean(managedClientId) !== Boolean(managedClientSecret)) {
    throw new Error('FIREBASE_CI_OAUTH_CLIENT_CREDENTIALS_PARTIAL');
  }
  const clientId = managedClientId || FIREBASE_CLI_OAUTH_CLIENT_ID;
  const clientSecret = managedClientSecret || FIREBASE_CLI_OAUTH_CLIENT_SECRET;

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });

  const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!response.ok) {
    const detail = redactOAuthDetail(await response.text());
    throw new Error(`No se pudo intercambiar FIREBASE_TOKEN por un access token (${response.status}): ${detail}`);
  }

  const data = await response.json();
  if (!data?.access_token) {
    throw new Error('Google no devolvió access_token al refrescar la credencial Firebase CI.');
  }

  return String(data.access_token);
}
