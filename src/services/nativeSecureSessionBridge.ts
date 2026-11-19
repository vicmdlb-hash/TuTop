import { createNativeSessionWriteQueue } from '../lib/nativeSessionWriteQueue';
import { FirebaseRestClient, type AuthSession } from './firebaseRest';
import { isNativeSecureSessionRuntime, markNativeSignedOut, persistNativeSessionRaw, volatileSessionStorage } from './nativeSecureSession';

const LEGACY_SESSION_KEY = 'tutop.firebase.session.v1';
const proto = FirebaseRestClient.prototype as any;
const queueNativeWrite = createNativeSessionWriteQueue(
  persistNativeSessionRaw,
  (key, raw) => {
    const current = volatileSessionStorage().getItem(key);
    return raw === null ? current === null : current === raw;
  },
  (key, raw) => {
    // Explicit sign-out keeps its tombstone. Only a successfully persisted
    // exact current session can become eligible for cold-start restoration.
    if (raw !== null) markNativeSignedOut(key, false);
  },
);


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
      // Keep Android's process-scoped encrypted restore as strict as the web
      // FirebaseRestClient reader. Malformed secure-store/legacy migration
      // JSON must not become a usable authenticated runtime session.
      const validIdentity = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        && typeof parsed.uid === 'string' && parsed.uid.length > 0
        && parsed.uid.length <= 256 && parsed.uid.trim() === parsed.uid
        && typeof parsed.idToken === 'string' && parsed.idToken.length > 0
        && parsed.idToken.length <= 16384
        && typeof parsed.refreshToken === 'string' && parsed.refreshToken.length > 0
        && parsed.refreshToken.length <= 16384
        && Number.isFinite(parsed.expiresAt) && parsed.expiresAt >= 0
        && (parsed.phone === undefined || typeof parsed.phone === 'string');
      if (!validIdentity) return null;
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
    // A new login or refreshed token must never clear the restart tombstone
    // until its exact encrypted write has completed. If the process is killed
    // before persistence succeeds, restoreNativeSessionForProject fails closed.
    markNativeSignedOut(key, true);
    const raw = session ? JSON.stringify(session) : null;
    if (raw === null) storage.removeItem(key);
    else storage.setItem(key, raw);
    // Queue is per project key; native plugin operations must not complete
    // out of order and restore credentials from an older account on restart.
    void queueNativeWrite(key, raw).catch(() => undefined);
  };
}

export const NATIVE_SECURE_SESSION_BRIDGE = {
  android_keystore_persistence: true,
  native_local_storage_tokens: false,
  process_session_storage_only: true,
  legacy_native_session_migrated_before_app_import: true,
  sign_out_tombstone_fail_closed: true,
  web_behavior_unchanged: true,
} as const;
