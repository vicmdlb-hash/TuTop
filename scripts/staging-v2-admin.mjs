import { firebaseCiAccessToken } from './firebase-ci-auth.mjs';

const projectId = String(process.env.TUTOP_FIREBASE_PROJECT_ID || '').trim();
const REQUIRED_PROJECT = 'tutop-beta-vicmdlb-1356585881';
const HISTORICAL_PROJECT = 'tutop-3a4f7';

if (!projectId || projectId === HISTORICAL_PROJECT || (projectId !== REQUIRED_PROJECT && process.env.TUTOP_ALLOW_ALTERNATE_STAGING !== '1')) {
  throw new Error('Staging admin helper bloqueado: project ID no autorizado.');
}

const token = await firebaseCiAccessToken();
const firestoreBase = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents`;
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Goog-User-Project': projectId };

function value(input) {
  if (input === null) return { nullValue: null };
  if (input instanceof Date) return { timestampValue: input.toISOString() };
  if (typeof input === 'string') return { stringValue: input };
  if (typeof input === 'boolean') return { booleanValue: input };
  if (Number.isInteger(input)) return { integerValue: String(input) };
  if (typeof input === 'number') return { doubleValue: input };
  throw new Error(`Tipo Firestore REST no soportado: ${typeof input}`);
}

async function request(url, options = {}, allow = []) {
  const response = await fetch(url, { ...options, headers: { ...headers, ...(options.headers || {}) } });
  const text = await response.text();
  if (!response.ok && !allow.includes(response.status)) throw new Error(`${response.status}: ${text.slice(0, 800)}`);
  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
}

export async function adminPatchDocument(path, fields) {
  const mask = Object.keys(fields).map((field) => `updateMask.fieldPaths=${encodeURIComponent(field)}`).join('&');
  const payload = { fields: Object.fromEntries(Object.entries(fields).map(([key, item]) => [key, value(item)])) };
  return request(`${firestoreBase}/${path}?${mask}`, { method: 'PATCH', body: JSON.stringify(payload) });
}

export async function adminDeleteDocument(path) {
  return request(`${firestoreBase}/${path}`, { method: 'DELETE' }, [404]);
}

export async function adminDeleteTestUsers(localIds) {
  if (!Array.isArray(localIds) || localIds.some((uid) => !String(uid).trim())) throw new Error('UIDs de cleanup inválidos.');
  if (!localIds.length) return null;
  return request(`https://identitytoolkit.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/accounts:batchDelete`, {
    method: 'POST', body: JSON.stringify({ localIds, force: true }),
  });
}
