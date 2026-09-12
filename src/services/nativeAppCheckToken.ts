type CapacitorPlugin = Record<string, (...args: any[]) => Promise<any>>;
type CapacitorRuntime = {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  registerPlugin?: (name: string) => CapacitorPlugin;
  Plugins?: Record<string, CapacitorPlugin>;
};

type CachedToken = { token: string; expiresAt: number };

let cached: CachedToken | null = null;
let initializePromise: Promise<CapacitorPlugin | null> | null = null;

function runtime(): CapacitorRuntime | null {
  if (typeof window === 'undefined') return null;
  return (window as unknown as { Capacitor?: CapacitorRuntime }).Capacitor || null;
}

export function isNativeFirebaseRuntime() {
  const capacitor = runtime();
  if (!capacitor) return false;
  if (typeof capacitor.isNativePlatform === 'function') return capacitor.isNativePlatform();
  return typeof capacitor.getPlatform === 'function' && capacitor.getPlatform() !== 'web';
}

function plugin(name: string): CapacitorPlugin | null {
  const capacitor = runtime();
  if (!capacitor) return null;
  if (typeof capacitor.registerPlugin === 'function') return capacitor.registerPlugin(name);
  return capacitor.Plugins?.[name] || null;
}

export async function initializeNativeAppCheck() {
  if (!isNativeFirebaseRuntime()) return null;
  if (initializePromise) return initializePromise;
  initializePromise = (async () => {
    const appCheck = plugin('FirebaseAppCheck');
    if (!appCheck?.initialize || !appCheck?.getToken) return null;
    await appCheck.initialize({ isTokenAutoRefreshEnabled: true });
    if (appCheck.setTokenAutoRefreshEnabled) await appCheck.setTokenAutoRefreshEnabled({ enabled: true });
    if (appCheck.addListener) {
      await appCheck.addListener('tokenChanged', (event: { token?: string }) => {
        const token = String(event?.token || '').trim();
        if (token) cached = { token, expiresAt: Date.now() + 45 * 60_000 };
      });
    }
    return appCheck;
  })().catch(() => null);
  return initializePromise;
}

export async function getNativeAppCheckToken(forceRefresh = false): Promise<string | null> {
  if (!isNativeFirebaseRuntime()) return null;
  if (!forceRefresh && cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
  const appCheck = await initializeNativeAppCheck();
  if (!appCheck?.getToken) return null;
  try {
    const result = await appCheck.getToken({ forceRefresh });
    const token = String(result?.token || '').trim();
    if (!token) return null;
    const expiresAt = Number(result?.expireTimeMillis || Date.now() + 45 * 60_000);
    cached = { token, expiresAt: Number.isFinite(expiresAt) ? expiresAt : Date.now() + 45 * 60_000 };
    return token;
  } catch {
    return null;
  }
}

export function clearNativeAppCheckTokenCache() {
  cached = null;
}
