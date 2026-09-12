type CapacitorPlugin = Record<string, (...args: any[]) => Promise<any>>;
type CapacitorRuntime = {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  registerPlugin?: (name: string) => CapacitorPlugin;
  Plugins?: Record<string, CapacitorPlugin>;
};

const LEGACY_SESSION_KEY = 'tutop.firebase.session.v1';
const SESSION_KEY_PREFIX = 'tutop.firebase.session.v2.';

function runtime(): CapacitorRuntime | null {
  if (typeof window === 'undefined') return null;
  return (window as unknown as { Capacitor?: CapacitorRuntime }).Capacitor || null;
}

export function isNativeSecureSessionRuntime() {
  const capacitor = runtime();
  if (!capacitor) return false;
  if (typeof capacitor.isNativePlatform === 'function') return capacitor.isNativePlatform();
  return typeof capacitor.getPlatform === 'function' && capacitor.getPlatform() !== 'web';
}

function securePlugin(): CapacitorPlugin | null {
  const capacitor = runtime();
  if (!capacitor) return null;
  if (typeof capacitor.registerPlugin === 'function') return capacitor.registerPlugin('TuTopSecureStore');
  return capacitor.Plugins?.TuTopSecureStore || null;
}

export function nativeSessionKey(projectId: string) {
  return `${SESSION_KEY_PREFIX}${projectId}`;
}

export function volatileSessionStorage() {
  return isNativeSecureSessionRuntime() ? sessionStorage : localStorage;
}

export async function persistNativeSessionRaw(key: string, raw: string | null) {
  if (!isNativeSecureSessionRuntime()) return;
  const plugin = securePlugin();
  if (!plugin) throw new Error('NATIVE_SECURE_STORE_UNAVAILABLE');
  if (raw === null) await plugin.remove({ key });
  else await plugin.set({ key, value: raw });
}

/**
 * Runs before App is imported. On Android it restores the encrypted session into
 * process-scoped sessionStorage. Existing 0.9.0 localStorage sessions are migrated
 * once into Android Keystore-backed storage and then removed from localStorage.
 */
export async function restoreNativeSessionForProject(projectId: string) {
  if (!isNativeSecureSessionRuntime()) return { restored: false, migrated: false };
  const key = nativeSessionKey(projectId);
  const plugin = securePlugin();
  if (!plugin?.get || !plugin?.set) throw new Error('NATIVE_SECURE_STORE_UNAVAILABLE');

  try {
    const stored = await plugin.get({ key });
    const raw = typeof stored?.value === 'string' ? stored.value : '';
    if (raw) {
      sessionStorage.setItem(key, raw);
      localStorage.removeItem(key);
      localStorage.removeItem(LEGACY_SESSION_KEY);
      return { restored: true, migrated: false };
    }
  } catch {
    // Continue into one-time legacy migration before failing closed to signed-out.
  }

  const legacyRaw = localStorage.getItem(key) || localStorage.getItem(LEGACY_SESSION_KEY);
  if (!legacyRaw) return { restored: false, migrated: false };
  try {
    const parsed = JSON.parse(legacyRaw) as { uid?: string; idToken?: string; refreshToken?: string };
    if (!parsed.uid || !parsed.idToken || !parsed.refreshToken) return { restored: false, migrated: false };
    await plugin.set({ key, value: legacyRaw });
    sessionStorage.setItem(key, legacyRaw);
    localStorage.removeItem(key);
    localStorage.removeItem(LEGACY_SESSION_KEY);
    return { restored: true, migrated: true };
  } catch {
    return { restored: false, migrated: false };
  }
}

export async function clearNativeSessionForProject(projectId: string) {
  const key = nativeSessionKey(projectId);
  sessionStorage.removeItem(key);
  localStorage.removeItem(key);
  localStorage.removeItem(LEGACY_SESSION_KEY);
  if (!isNativeSecureSessionRuntime()) return;
  const plugin = securePlugin();
  if (plugin?.remove) await plugin.remove({ key }).catch(() => undefined);
}
