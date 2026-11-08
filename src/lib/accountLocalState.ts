export const ACCOUNT_LOCAL_KEYS = {
  searchHistory: 'tutop.search-history.v1',
  recentProducts: 'tutop.recent-products.v1',
  interests: 'tutop.interests.v1',
  onboarding: 'tutop.onboarding.v1',
  savedSearches: 'tutop.saved-searches.local.v1',
} as const;

function normalizedOwner(ownerUid: string) {
  // Runtime bridges can receive untyped JSON despite the TS signature.
  // Never coerce an object/array into a shared "[object Object]" owner key.
  if (typeof ownerUid !== 'string') return '';
  const owner = ownerUid.trim();
  return /^[A-Za-z0-9:_-]{1,160}$/.test(owner) ? owner : '';
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
  if (!raw || !Number.isSafeInteger(max) || max < 0 || max > 100) return [] as string[];
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value)
      ? value.filter((item) => typeof item === 'string').slice(0, max) as string[]
      : [];
  } catch { return []; }
}

export function writeAccountLocalList(baseKey: string, ownerUid: string, values: string[], max = values.length) {
  if (!Array.isArray(values) || !Number.isSafeInteger(max) || max < 0 || max > 100) return;
  const clean = values.filter((item) => typeof item === 'string').slice(0, max);
  writeAccountLocalText(baseKey, ownerUid, JSON.stringify(clean));
}

// Legacy saved-search caches may be corrupted or carry unexpected private
// fields. Keep only fields the offline saved-search UI actually persists.
// Never propagate arbitrary local JSON into a new per-account record.
function safeLocalSavedSearches(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value) || value.length > 100) return [];
  const stringField = (value: unknown, max: number) =>
    typeof value === 'string' && value.length > 0 && value.length <= max
      && !/[\u0000-\u001f\u007f]/.test(value) ? value : null;
  const allowedScopes = new Set(['campus', 'institution', 'university-zone', 'city', 'national']);
  return value.slice(0, 20).flatMap((raw) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
    const src = raw as Record<string, unknown>;
    const query = stringField(src.query, 512);
    if (!query || !query.trim()) return [];
    const item: Record<string, unknown> = { query };
    for (const [field, max] of [
      ['id', 128], ['category', 80], ['institution_id', 160],
      ['campus_id', 160], ['created_at', 40],
    ] as const) {
      const clean = stringField(src[field], max);
      if (clean) item[field] = clean;
    }
    if (allowedScopes.has(src.visibility_scope as string))
      item.visibility_scope = src.visibility_scope;
    if (typeof src.notifications_enabled === 'boolean')
      item.notifications_enabled = src.notifications_enabled;
    if (typeof src.max_price_mxn === 'number' && Number.isFinite(src.max_price_mxn)
      && src.max_price_mxn >= 0 && src.max_price_mxn <= 1_000_000_000)
      item.max_price_mxn = src.max_price_mxn;
    return [item];
  });
}

export function readAccountLocalJson<T>(baseKey: string, ownerUid: string, fallback: T): T {
  const raw = readAccountLocalText(baseKey, ownerUid);
  if (!raw) return fallback;
  if (baseKey === ACCOUNT_LOCAL_KEYS.savedSearches && raw.length > 64 * 1024) return fallback;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (baseKey === ACCOUNT_LOCAL_KEYS.savedSearches && Array.isArray(fallback))
      return safeLocalSavedSearches(parsed) as T;
    // JSON syntax alone does not make cached account data the expected shape.
    // A stale object/null in an array-backed preference must not crash Feed.
    if (Array.isArray(fallback) && !Array.isArray(parsed)) return fallback;
    if (fallback !== null && typeof fallback === 'object' && !Array.isArray(fallback)
      && (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed))) return fallback;
    if (fallback === null && parsed !== null) return fallback;
    if (typeof fallback === 'string' && typeof parsed !== 'string') return fallback;
    if (typeof fallback === 'number' && (typeof parsed !== 'number' || !Number.isFinite(parsed))) return fallback;
    if (typeof fallback === 'boolean' && typeof parsed !== 'boolean') return fallback;
    return parsed as T;
  } catch { return fallback; }
}

export function writeAccountLocalJson(baseKey: string, ownerUid: string, value: unknown) {
  if (baseKey === ACCOUNT_LOCAL_KEYS.savedSearches) {
    if (!Array.isArray(value)) return;
    writeAccountLocalText(baseKey, ownerUid, JSON.stringify(safeLocalSavedSearches(value)));
    return;
  }
  writeAccountLocalText(baseKey, ownerUid, JSON.stringify(value));
}
