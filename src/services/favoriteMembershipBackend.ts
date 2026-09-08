import { FirebaseRestClient } from './firebaseRest';
import { getFirebaseConfig } from './runtimeConfig';

const MAX_IN_VALUES = 30;
const CACHE_TTL_MS = 30_000;
const MAX_PRODUCT_IDS = 300;

type CacheEntry = { favorited: boolean; expiresAt: number };
const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<Set<string>>>();

function client() {
  const config = getFirebaseConfig();
  if (!config) throw new Error('FIREBASE_NOT_CONFIGURED');
  return new FirebaseRestClient(config);
}

function chunk<T>(values: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

function normalizeProductIds(productIds: string[]) {
  return [...new Set(productIds.map((value) => String(value || '').trim()).filter(Boolean))].slice(0, MAX_PRODUCT_IDS);
}

function cacheKey(uid: string, productId: string) { return `${uid}:${productId}`; }

export function invalidateFavoriteMembership(uid: string, productId: string) {
  cache.delete(cacheKey(uid, productId));
}

export function primeFavoriteMembership(uid: string, productId: string, favorited: boolean) {
  cache.set(cacheKey(uid, productId), { favorited, expiresAt: Date.now() + CACHE_TTL_MS });
}

export async function loadFavoriteMembership(productIds: string[]): Promise<Set<string>> {
  const rest = client();
  const session = rest.currentSession;
  if (!session) throw new Error('AUTH_REQUIRED');
  const ids = normalizeProductIds(productIds);
  if (!ids.length) return new Set();

  const now = Date.now();
  const result = new Set<string>();
  const missing: string[] = [];
  for (const productId of ids) {
    const cached = cache.get(cacheKey(session.uid, productId));
    if (cached && cached.expiresAt > now) {
      if (cached.favorited) result.add(productId);
    } else missing.push(productId);
  }
  if (!missing.length) return result;

  const requestKey = `${session.uid}:${missing.slice().sort().join('|')}`;
  let pending = inFlight.get(requestKey);
  if (!pending) {
    pending = (async () => {
      const found = new Set<string>();
      for (const group of chunk(missing, MAX_IN_VALUES)) {
        const docs = await rest.runQuery<any>('favorites', [
          { field: 'uid', op: 'EQUAL', value: session.uid },
          { field: 'product_id', op: 'IN', value: group },
        ], [], Math.max(1, group.length));
        for (const doc of docs) {
          const productId = String(doc.data?.product_id || '');
          if (group.includes(productId)) found.add(productId);
        }
      }
      const expiresAt = Date.now() + CACHE_TTL_MS;
      for (const productId of missing) cache.set(cacheKey(session.uid, productId), { favorited: found.has(productId), expiresAt });
      return found;
    })().finally(() => inFlight.delete(requestKey));
    inFlight.set(requestKey, pending);
  }

  for (const productId of await pending) result.add(productId);
  return result;
}

export const FAVORITE_MEMBERSHIP_MAX_IN_VALUES = MAX_IN_VALUES;
export const FAVORITE_MEMBERSHIP_CACHE_TTL_MS = CACHE_TTL_MS;
export const FAVORITE_MEMBERSHIP_MAX_PRODUCT_IDS = MAX_PRODUCT_IDS;
