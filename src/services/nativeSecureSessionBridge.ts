import { FirebaseRestClient, type AuthSession } from './firebaseRest';
import { isNativeSecureSessionRuntime, persistNativeSessionRaw, volatileSessionStorage } from './nativeSecureSession';

const LEGACY_SESSION_KEY = 'tutop.firebase.session.v1';
const proto = FirebaseRestClient.prototype as any;

if (!proto.__tutopNativeSecureSessionInstalled) {
  Object.defineProperty(proto, '__tutopNativeSecureSessionInstalled', { value: true, configurable: false, enumerable: false });
  const originalRead = proto.readStoredSession;
  const originalPersist = proto.persistSession;

  proto.readStoredSession = function nativeReadStoredSession(this: FirebaseRestClient): AuthSession | null {
    if (!isNativeSecureSessionRuntime()) return originalRead.call(this);
    try {
      const internal = this as any;
      const key = String(internal.sessionStorageKey || '');
      if (!key) return null;
      const raw = volatileSessionStorage().getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as AuthSession;
      if (!parsed.uid || !parsed.idToken || !parsed.refreshToken) return null;
      return parsed;
    } catch { return null; }
  };

  proto.persistSession = function nativePersistSession(this: FirebaseRestClient, session: AuthSession | null) {
    if (!isNativeSecureSessionRuntime()) return originalPersist.call(this, session);
    const internal = this as any;
    const key = String(internal.sessionStorageKey || '');
    internal.session = session;
    localStorage.removeItem(LEGACY_SESSION_KEY);
    if (key) localStorage.removeItem(key);
    const storage = volatileSessionStorage();
    if (!key) return;
    if (session) {
      const raw = JSON.stringify(session);
      storage.setItem(key, raw);
      void persistNativeSessionRaw(key, raw).catch(() => undefined);
    } else {
      storage.removeItem(key);
      void persistNativeSessionRaw(key, null).catch(() => undefined);
    }
  };
}

export const NATIVE_SECURE_SESSION_BRIDGE = {
  android_keystore_persistence: true,
  native_local_storage_tokens: false,
  process_session_storage_only: true,
  legacy_native_session_migrated_before_app_import: true,
  web_behavior_unchanged: true,
} as const;
