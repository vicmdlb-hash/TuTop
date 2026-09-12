import { getNativeAppCheckToken } from './nativeAppCheckToken';
import { FirebaseRestClient } from './firebaseRest';
import { getFirebaseConfig } from './runtimeConfig';

const STRIKE_WINDOW_MS = 30 * 24 * 60 * 60_000;
const STRIKE_CACHE_TTL_MS = 5 * 60_000;
const cache = new Map<string, { value: number; expiresAt: number }>();
const inflight = new Map<string, Promise<number>>();

function client() {
  const firebase = new FirebaseRestClient(getFirebaseConfig());
  if (!firebase.currentSession?.uid) throw new Error('AUTH_REQUIRED');
  return firebase;
}

export const reviewStrikeCountBackend = {
  async load(force = false) {
    const firebase = client();
    const uid = firebase.currentSession!.uid;
    const cached = cache.get(uid);
    if (!force && cached && cached.expiresAt > Date.now()) return cached.value;
    const pending = inflight.get(uid);
    if (!force && pending) return pending;

    const request = (async () => {
      const token = await firebase.getIdToken();
      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      };
      const appCheck = await getNativeAppCheckToken(false).catch(() => null);
      if (appCheck) headers['X-Firebase-AppCheck'] = appCheck;
      const cutoff = new Date(Date.now() - STRIKE_WINDOW_MS).toISOString();
      const endpoint = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(firebase.projectId)}/databases/(default)/documents:runAggregationQuery`;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          structuredAggregationQuery: {
            structuredQuery: {
              from: [{ collectionId: 'reviews' }],
              where: {
                compositeFilter: {
                  op: 'AND',
                  filters: [
                    { fieldFilter: { field: { fieldPath: 'evaluado_id' }, op: 'EQUAL', value: { stringValue: uid } } },
                    { fieldFilter: { field: { fieldPath: 'calificacion' }, op: 'EQUAL', value: { stringValue: 'negative' } } },
                    { fieldFilter: { field: { fieldPath: 'fecha' }, op: 'GREATER_THAN_OR_EQUAL', value: { timestampValue: cutoff } } },
                  ],
                },
              },
            },
            aggregations: [{ alias: 'count', count: {} }],
          },
        }),
      });
      const text = await response.text();
      let data: any = null;
      try { data = text ? JSON.parse(text) : null; } catch { data = null; }
      if (!response.ok) throw new Error(String(data?.error?.message || `HTTP ${response.status}`));
      const rows = Array.isArray(data) ? data : [];
      const raw = rows.find((row) => row?.result?.aggregateFields?.count)?.result?.aggregateFields?.count;
      const count = Number(raw?.integerValue ?? raw?.doubleValue ?? NaN);
      if (!Number.isFinite(count) || count < 0) throw new Error('INVALID_STRIKE_COUNT');
      const value = Math.trunc(count);
      cache.set(uid, { value, expiresAt: Date.now() + STRIKE_CACHE_TTL_MS });
      return value;
    })().finally(() => inflight.delete(uid));

    inflight.set(uid, request);
    return request;
  },
};
