import './dangerous-script-apply-guard.mjs';

const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

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

  const clientId = String(process.env.TUTOP_FIREBASE_OAUTH_CLIENT_ID || '').trim();
  const clientSecret = String(process.env.TUTOP_FIREBASE_OAUTH_CLIENT_SECRET || '').trim();
  if (!clientId || !clientSecret) {
    throw new Error('FIREBASE_CI_OAUTH_CLIENT_CREDENTIALS_MISSING');
  }

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
