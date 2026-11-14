/**
 * Per-account, per-installation native push opt-out.
 * OS notification permission and Firebase token registration are separate.
 * Never store token values, refresh credentials or emails here.
 */
export const NATIVE_PUSH_OPT_OUT_PREFIX = 'tutop.push.opt-out.v1.';

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function safeKey(uid: string) {
  const clean = String(uid || '').trim();
  return /^[A-Za-z0-9:_-]{4,160}$/.test(clean) ? NATIVE_PUSH_OPT_OUT_PREFIX + clean : '';
}

function availableStorage(storage?: StorageLike): StorageLike | null {
  if (storage) return storage;
  try { return typeof localStorage === 'undefined' ? null : localStorage; }
  catch { return null; }
}

/**
 * Unknown or unavailable persistence fails closed to no automatic registration.
 * Only an absent key for a valid UID means no explicit opt-out.
 */
export function isNativePushOptedOut(uid: string, storage?: StorageLike): boolean {
  const key = safeKey(uid);
  const target = availableStorage(storage);
  if (!key || !target) return true;
  try {
    const value = target.getItem(key);
    return value !== null;
  } catch { return true; }
}

/** Write then verify; failures must never be mistaken for durable consent. */
export function setNativePushOptOut(uid: string, optedOut: boolean, storage?: StorageLike): boolean {
  const key = safeKey(uid);
  const target = availableStorage(storage);
  if (!key || !target) return false;
  try {
    if (optedOut) target.setItem(key, '1');
    else target.removeItem(key);
    return target.getItem(key) === (optedOut ? '1' : null);
  } catch { return false; }
}
