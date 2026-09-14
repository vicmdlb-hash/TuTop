import { firebaseCiAccessToken } from './firebase-ci-auth.mjs';
import { assertStagingFreezeContext } from './staging-freeze-guard.mjs';

const projectId = assertStagingFreezeContext();
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

export async function adminGetDocument(path) {
  const result = await request(`${firestoreBase}/${path}`, { method: 'GET' }, [404]);
  if (!result || typeof result !== 'object' || !result.name) return null;
  return result;
}

export async function adminPatchDocument(path, fields) {
  const mask = Object.keys(fields).map((field) => `updateMask.fieldPaths=${encodeURIComponent(field)}`).join('&');
  const payload = { fields: Object.fromEntries(Object.entries(fields).map(([key, item]) => [key, value(item)])) };
  return request(`${firestoreBase}/${path}?${mask}`, { method: 'PATCH', body: JSON.stringify(payload) });
}

export async function adminDeleteDocument(path) {
  return request(`${firestoreBase}/${path}`, { method: 'DELETE' }, [404]);
}

export async function adminRunQuery(collectionId, filters = [], limit = 500) {
  const where = filters.length === 0 ? undefined : filters.length === 1
    ? { fieldFilter: { field: { fieldPath: filters[0].field }, op: 'EQUAL', value: value(filters[0].value) } }
    : { compositeFilter: { op: 'AND', filters: filters.map((filter) => ({ fieldFilter: { field: { fieldPath: filter.field }, op: 'EQUAL', value: value(filter.value) } })) } };
  const body = { structuredQuery: { from: [{ collectionId }], ...(where ? { where } : {}), limit: Math.max(1, Math.min(1000, Number(limit) || 500)) } };
  const rows = await request(`https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents:runQuery`, { method: 'POST', body: JSON.stringify(body) });
  return (Array.isArray(rows) ? rows : []).map((row) => row?.document).filter(Boolean).map((document) => ({
    name: String(document.name || ''),
    path: String(document.name || '').split('/documents/')[1] || '',
    fields: document.fields || {},
  }));
}

export async function adminListDocuments(collectionPath, pageSize = 300) {
  const results = [];
  let pageToken = '';
  do {
    const query = new URLSearchParams({ pageSize: String(Math.max(1, Math.min(1000, Number(pageSize) || 300))) });
    if (pageToken) query.set('pageToken', pageToken);
    const raw = await request(`${firestoreBase}/${collectionPath.split('/').map(encodeURIComponent).join('/')}?${query}`);
    for (const document of raw?.documents || []) {
      results.push({
        name: String(document.name || ''),
        path: String(document.name || '').split('/documents/')[1] || '',
        fields: document.fields || {},
      });
    }
    pageToken = String(raw?.nextPageToken || '');
  } while (pageToken);
  return results;
}

export async function adminListAuthUsers(pageSize = 500) {
  const users = [];
  let nextPageToken = '';
  do {
    const body = { maxResults: Math.max(1, Math.min(1000, Number(pageSize) || 500)), ...(nextPageToken ? { nextPageToken } : {}) };
    const raw = await request(`https://identitytoolkit.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/accounts:query`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    for (const user of raw?.users || []) {
      const localId = String(user?.localId || '').trim();
      if (localId) users.push({ localId, email: String(user?.email || '') });
    }
    nextPageToken = String(raw?.nextPageToken || '');
  } while (nextPageToken);
  return users;
}

export async function adminDeleteTestUsers(localIds) {
  if (!Array.isArray(localIds) || localIds.some((uid) => !String(uid).trim())) throw new Error('UIDs de cleanup inválidos.');
  if (!localIds.length) return null;
  return request(`https://identitytoolkit.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/accounts:batchDelete`, {
    method: 'POST', body: JSON.stringify({ localIds, force: true }),
  });
}
