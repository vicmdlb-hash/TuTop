import { FirebaseRestClient } from './firebaseRest';
import { getFirebaseConfig } from './runtimeConfig';

const MAX_VISIBLE_FAVORITES = 120;
const CACHE_TTL_MS = 5 * 60_000;
const cache = new Map<string, { value: boolean; expiresAt: number }>();

function client() {
  const firebase = new FirebaseRestClient(getFirebaseConfig());
  if (!firebase.currentSession?.uid) throw new Error('AUTH_REQUIRED');
  return firebase;
}

export const visibleFavoritesBackend = {
  async load(productIds: string[]): Promise<string[]> {
    const firebase = client();
    const uid = firebase.currentSession!.uid;
    const unique = [...new Set(productIds.map((id) => id.trim()).filter(Boolean))];
    if (unique.length > MAX_VISIBLE_FAVORITES) throw new Error('VISIBLE_FAVORITES_SCOPE_TOO_LARGE');
    const now = Date.now();
    const resolved = new Map<string, boolean>();
    const missing: string[] = [];

    for (const productId of unique) {
      const key = `${uid}_${productId}`;
      const hit = cache.get(key);
      if (hit && hit.expiresAt > now) resolved.set(productId, hit.value);
      else missing.push(productId);
    }

    await Promise.all(missing.map(async (productId) => {
      const key = `${uid}_${productId}`;
      const doc = await firebase.getDocument<any>(`favorites/${key}`);
      const value = Boolean(doc && String(doc.data?.uid || '') === uid && String(doc.data?.product_id || '') === productId);
      cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
      resolved.set(productId, value);
    }));

    return unique.filter((productId) => resolved.get(productId) === true);
  },
  invalidate(productId?: string) {
    if (!productId) { cache.clear(); return; }
    for (const key of [...cache.keys()]) if (key.endsWith(`_${productId}`)) cache.delete(key);
  },
};

export const VISIBLE_FAVORITES_MAX_PRODUCTS = MAX_VISIBLE_FAVORITES;
