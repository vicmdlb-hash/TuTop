export const ACCOUNT_LOCAL_KEYS = {
  searchHistory: 'tutop.search-history.v1',
  recentProducts: 'tutop.recent-products.v1',
  interests: 'tutop.interests.v1',
  onboarding: 'tutop.onboarding.v1',
  savedSearches: 'tutop.saved-searches.local.v1',
} as const;

function normalizedOwner(ownerUid: string) {
  return String(ownerUid || '').trim();
}

export function accountLocalKey(baseKey: string, ownerUid: string) {
  const owner = normalizedOwner(ownerUid);
  return owner ? `${baseKey}:uid:${encodeURIComponent(owner)}` : null;
}

function dropLegacyUnscoped(baseKey: string) {
  try { localStorage.removeItem(baseKey); } catch { /* optional local state */ }
}

export function readAccountLocalText(baseKey: string, ownerUid: string) {
  dropLegacyUnscoped(baseKey);
  const key = accountLocalKey(baseKey, ownerUid);
  if (!key) return null;
  try { return localStorage.getItem(key); } catch { return null; }
}

export function writeAccountLocalText(baseKey: string, ownerUid: string, value: string) {
  dropLegacyUnscoped(baseKey);
  const key = accountLocalKey(baseKey, ownerUid);
  if (!key) return;
  try { localStorage.setItem(key, value); } catch { /* optional local state */ }
}

export function readAccountLocalList(baseKey: string, ownerUid: string, max = 12) {
  const raw = readAccountLocalText(baseKey, ownerUid);
  if (!raw) return [] as string[];
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value)
      ? value.filter((item) => typeof item === 'string').slice(0, max) as string[]
      : [];
  } catch { return []; }
}

export function writeAccountLocalList(baseKey: string, ownerUid: string, values: string[], max = values.length) {
  const clean = values.filter((item) => typeof item === 'string').slice(0, max);
  writeAccountLocalText(baseKey, ownerUid, JSON.stringify(clean));
}

export function readAccountLocalJson<T>(baseKey: string, ownerUid: string, fallback: T): T {
  const raw = readAccountLocalText(baseKey, ownerUid);
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

export function writeAccountLocalJson(baseKey: string, ownerUid: string, value: unknown) {
  writeAccountLocalText(baseKey, ownerUid, JSON.stringify(value));
}
