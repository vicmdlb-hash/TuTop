import { FirebaseRestClient } from './firebaseRest';
import { getNativeAppCheckToken } from './nativeAppCheckToken';
import { getFirebaseConfig } from './runtimeConfig';

const MAX_VISIBLE_FAVORITES = 120;
const MAX_IN_VALUES = 30;
const CACHE_TTL_MS = 30_000;
const cache = new Map<string, { value: boolean; expiresAt: number }>();
const mutationVersion = new Map<string, number>();
const inFlight = new Map<string, Promise<void>>();

function client() {
  const config = getFirebaseConfig();
  if (!config) throw new Error('FIREBASE_NOT_CONFIGURED');
  const firebase = new FirebaseRestClient(config);
  if (!firebase.currentSession?.uid) throw new Error('AUTH_REQUIRED');
  return firebase;
}

function key(uid: string, productId: string) { return `${uid}_${productId}`; }
function version(uid: string, productId: string) { return mutationVersion.get(key(uid, productId)) || 0; }
function chunks<T>(values: T[], size: number) {
  const result: T[][] = [];
  for (let i = 0; i < values.length; i += size) result.push(values.slice(i, i + size));
  return result;
}

async function queryGroup(firebase: FirebaseRestClient, uid: string, productIds: string[]) {
  const token = await firebase.getIdToken();
  const appCheck = await getNativeAppCheckToken(false).catch(() => null);
  const headers: Record<string, string> = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  if (appCheck) headers['X-Firebase-AppCheck'] = appCheck;
  const response = await fetch(
    `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(firebase.projectId)}/databases/(default)/documents:runQuery`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: 'favorites' }],
          where: {
            compositeFilter: {
              op: 'AND',
              filters: [
                { fieldFilter: { field: { fieldPath: 'uid' }, op: 'EQUAL', value: { stringValue: uid } } },
                {
                  fieldFilter: {
                    field: { fieldPath: 'product_id' },
                    op: 'IN',
                    value: { arrayValue: { values: productIds.map((productId) => ({ stringValue: productId })) } },
                  },
                },
              ],
            },
          },
          limit: Math.max(1, productIds.length),
        },
      }),
    },
  );
  const json = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(String(json?.error?.message || `VISIBLE_FAVORITES_QUERY_${response.status}`));
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }
  const found = new Set<string>();
  for (const row of Array.isArray(json) ? json : []) {
    const productId = row?.document?.fields?.product_id?.stringValue;
    if (typeof productId === 'string' && productIds.includes(productId)) found.add(productId);
  }
  return found;
}

export const visibleFavoritesBackend = {
  beginMutation(productId: string, favorited: boolean) {
    const firebase = client();
    const uid = firebase.currentSession!.uid;
    const cacheKey = key(uid, productId);
    const next = (mutationVersion.get(cacheKey) || 0) + 1;
    mutationVersion.set(cacheKey, next);
    cache.set(cacheKey, { value: favorited, expiresAt: Date.now() + CACHE_TTL_MS });
    return next;
  },

  rollbackMutation(productId: string, mutation: number, favorited: boolean) {
    const firebase = client();
    const uid = firebase.currentSession!.uid;
    const cacheKey = key(uid, productId);
    if (mutationVersion.get(cacheKey) !== mutation) return false;
    cache.set(cacheKey, { value: favorited, expiresAt: Date.now() + CACHE_TTL_MS });
    return true;
  },

  currentVersion(productId: string) {
    const firebase = client();
    return version(firebase.currentSession!.uid, productId);
  },

  async load(productIds: string[]): Promise<string[]> {
    const firebase = client();
    const uid = firebase.currentSession!.uid;
    const unique = [...new Set(productIds.map((id) => id.trim()).filter(Boolean))];
    if (unique.length > MAX_VISIBLE_FAVORITES) throw new Error('VISIBLE_FAVORITES_SCOPE_TOO_LARGE');
    const now = Date.now();
    const missing = unique.filter((productId) => {
      const hit = cache.get(key(uid, productId));
      return !hit || hit.expiresAt <= now;
    });

    if (missing.length) {
      const requestKey = `${uid}:${missing.slice().sort().join('|')}`;
      let pending = inFlight.get(requestKey);
      if (!pending) {
        const startVersions = new Map(missing.map((productId) => [productId, version(uid, productId)]));
        pending = (async () => {
          const found = new Set<string>();
          for (const group of chunks(missing, MAX_IN_VALUES)) {
            for (const productId of await queryGroup(firebase, uid, group)) found.add(productId);
          }
          const expiresAt = Date.now() + CACHE_TTL_MS;
          for (const productId of missing) {
            if (version(uid, productId) !== startVersions.get(productId)) continue;
            cache.set(key(uid, productId), { value: found.has(productId), expiresAt });
          }
        })().finally(() => inFlight.delete(requestKey));
        inFlight.set(requestKey, pending);
      }
      await pending;
    }

    return unique.filter((productId) => cache.get(key(uid, productId))?.value === true);
  },

  invalidate(productId?: string) {
    if (!productId) { cache.clear(); return; }
    for (const cacheKey of [...cache.keys()]) if (cacheKey.endsWith(`_${productId}`)) cache.delete(cacheKey);
  },
};

export const VISIBLE_FAVORITES_MAX_PRODUCTS = MAX_VISIBLE_FAVORITES;
export const VISIBLE_FAVORITES_MAX_IN_VALUES = MAX_IN_VALUES;
export const VISIBLE_FAVORITES_CACHE_TTL_MS = CACHE_TTL_MS;
