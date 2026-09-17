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
let lastFailure: 'none' | 'plugin-unavailable' | 'initialize-failed' | 'token-failed' | 'timeout' = 'none';
const APP_CHECK_INITIALIZE_TIMEOUT_MS = 6_000;
const APP_CHECK_AUX_TIMEOUT_MS = 3_000;
const APP_CHECK_TOKEN_TIMEOUT_MS = 6_000;

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

function useStagingDebugProvider() {
  const environment = String(import.meta.env.VITE_TUTOP_ENVIRONMENT || '').trim().toLowerCase();
  const version = String(import.meta.env.VITE_TUTOP_APP_VERSION || '').trim();
  // 0.9.1 used the Firebase debug provider and therefore needed a per-device
  // debug secret to be registered manually. That is exactly why a physical APK
  // could silently lose real AI. 0.9.2 deliberately uses the native default
  // provider (Play Integrity on Android), which is the production-shaped path
  // and never embeds or logs a reusable debug secret in the app.
  return environment === 'staging' && /^0\.9\.1-beta\./.test(version);
}

export function nativeAppCheckProviderMode() {
  return useStagingDebugProvider() ? 'debug' : 'play-integrity';
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer = 0;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timer = window.setTimeout(() => reject(new Error('APP_CHECK_TIMEOUT')), timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => window.clearTimeout(timer));
}

function timedOut(error: unknown) {
  return error instanceof Error && error.message === 'APP_CHECK_TIMEOUT';
}

export async function initializeNativeAppCheck() {
  if (!isNativeFirebaseRuntime()) return null;
  if (initializePromise) return initializePromise;
  initializePromise = (async () => {
    const appCheck = plugin('FirebaseAppCheck');
    if (!appCheck?.initialize || !appCheck?.getToken) {
      lastFailure = 'plugin-unavailable';
      return null;
    }
    await withTimeout(appCheck.initialize({
      isTokenAutoRefreshEnabled: true,
      debugToken: useStagingDebugProvider(),
    }), APP_CHECK_INITIALIZE_TIMEOUT_MS);
    if (appCheck.setTokenAutoRefreshEnabled) {
      await withTimeout(appCheck.setTokenAutoRefreshEnabled({ enabled: true }), APP_CHECK_AUX_TIMEOUT_MS);
    }
    if (appCheck.addListener) {
      await withTimeout(appCheck.addListener('tokenChanged', (event: { token?: string }) => {
        const token = String(event?.token || '').trim();
        if (token) {
          cached = { token, expiresAt: Date.now() + 45 * 60_000 };
          lastFailure = 'none';
        }
      }), APP_CHECK_AUX_TIMEOUT_MS);
    }
    lastFailure = 'none';
    return appCheck;
  })().catch((error) => {
    lastFailure = timedOut(error) ? 'timeout' : 'initialize-failed';
    // A hung native call must not poison all later retries with the same pending
    // promise. The underlying plugin may eventually settle, but callers are
    // bounded and a later request may initialize again safely.
    initializePromise = null;
    return null;
  });
  return initializePromise;
}

export async function getNativeAppCheckToken(forceRefresh = false): Promise<string | null> {
  if (!isNativeFirebaseRuntime()) return null;
  if (!forceRefresh && cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
  const appCheck = await initializeNativeAppCheck();
  if (!appCheck?.getToken) return null;
  try {
    const result = await withTimeout(appCheck.getToken({ forceRefresh }), APP_CHECK_TOKEN_TIMEOUT_MS);
    const token = String(result?.token || '').trim();
    if (!token) {
      lastFailure = 'token-failed';
      return null;
    }
    const expiresAt = Number(result?.expireTimeMillis || Date.now() + 45 * 60_000);
    cached = { token, expiresAt: Number.isFinite(expiresAt) ? expiresAt : Date.now() + 45 * 60_000 };
    lastFailure = 'none';
    return token;
  } catch (error) {
    lastFailure = timedOut(error) ? 'timeout' : 'token-failed';
    return null;
  }
}

export function nativeAppCheckStatus() {
  return {
    native: isNativeFirebaseRuntime(),
    provider: nativeAppCheckProviderMode(),
    debugProvider: useStagingDebugProvider(),
    tokenCached: Boolean(cached && cached.expiresAt > Date.now() + 60_000),
    lastFailure,
  };
}

export function clearNativeAppCheckTokenCache() {
  cached = null;
}
