const FIREBASE_OAUTH_CLIENT_ID = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com';
const FIREBASE_OAUTH_CLIENT_SECRET = 'j9iVZfS8kkCEFUPaAeJV0sAi';
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

export async function firebaseCiAccessToken() {
  const explicit = String(process.env.TUTOP_FIREBASE_ACCESS_TOKEN || '').trim();
  if (explicit) return explicit;

  const refreshToken = String(process.env.FIREBASE_TOKEN || '').trim();
  if (!refreshToken) {
    throw new Error('Falta FIREBASE_TOKEN o TUTOP_FIREBASE_ACCESS_TOKEN para obtener un access token de Google.');
  }

  const body = new URLSearchParams({
    client_id: FIREBASE_OAUTH_CLIENT_ID,
    client_secret: FIREBASE_OAUTH_CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });

  const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`No se pudo intercambiar FIREBASE_TOKEN por un access token (${response.status}): ${detail.slice(0, 500)}`);
  }

  const data = await response.json();
  if (!data?.access_token) {
    throw new Error('Google no devolvió access_token al refrescar la credencial Firebase CI.');
  }

  return String(data.access_token);
}
