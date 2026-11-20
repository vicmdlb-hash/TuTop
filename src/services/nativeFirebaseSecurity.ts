import { pushBackend } from './pushBackend';
import { verifiedEmailBetaAuth } from './verifiedEmailBetaAuth';
import { matchesNativePushSession, needsNativePushOwnershipReset, nativePushReconciliationStillPending, type PushSessionWitness } from '../lib/nativePushSessionGuard';
import { isNativePushOptedOut, setNativePushOptOut } from '../lib/nativePushOptOut';
import { initializeNativeAppCheck, isNativeFirebaseRuntime } from './nativeAppCheckToken';

type CapacitorPlugin = Record<string, (...args: any[]) => Promise<any>>;
type PushPermission = 'granted' | 'denied' | 'prompt' | 'prompt-with-rationale' | 'unavailable';
export type PushRegistrationReason =
  | 'registered'
  | 'permission-not-granted'
  | 'plugin-unavailable'
  | 'ownership-reconciliation-pending'
  | 'token-empty'
  | 'firebase-config-rejected'
  | 'network-failure'
  | 'server-registration-failed'
  | 'token-registration-failed'
  | 'user-opted-out'
  | 'preference-storage-unavailable';

export type NativeNotificationIntent = {
  source: 'received' | 'action';
  notification_id?: string;
  kind?: string;
  chat_id?: string;
  listing_id?: string;
  transaction_id?: string;
  saved_search_id?: string;
  recipient_uid?: string;
};

export const NATIVE_NOTIFICATION_EVENT = 'tutop:native-notification';

let initialization: Promise<void> | null = null;
let listenersInstalled = false;
let listenerInstallation: Promise<void> | null = null;
let ownershipRetryInstalled = false;
// A logout or native disable immediately invalidates all earlier registration work.
let pushRegistrationEpoch = 0;
const PENDING_PUSH_OWNERSHIP_RESET_KEY = 'tutop.push.pending-owner-reset.v1';

function nativePushOptedOut() {
  const uid = verifiedEmailBetaAuth.readSessionIdentity()?.uid || '';
  return isNativePushOptedOut(uid);
}

// Keep a process-local quarantine when browser storage writes/readbacks fail.
// This is NOT proof of persistence across Android process death.
let pendingPushOwnershipResetVolatile = false;

function pendingPushOwnershipReset() {
  if (pendingPushOwnershipResetVolatile) return true;
  try { return typeof localStorage === 'undefined' || localStorage.getItem(PENDING_PUSH_OWNERSHIP_RESET_KEY) === '1'; }
  catch { return true; }
}

function setPendingPushOwnershipReset(pending: boolean) {
  if (pending) pendingPushOwnershipResetVolatile = true;
  try {
    if (typeof localStorage === 'undefined') return false;
    if (pending) localStorage.setItem(PENDING_PUSH_OWNERSHIP_RESET_KEY, '1');
    else localStorage.removeItem(PENDING_PUSH_OWNERSHIP_RESET_KEY);
    if (localStorage.getItem(PENDING_PUSH_OWNERSHIP_RESET_KEY) !== (pending ? '1' : null)) return false;
    pendingPushOwnershipResetVolatile = false;
    return true;
  } catch { return false; }
}

function installPushOwnershipRetryListener() {
  if (ownershipRetryInstalled || typeof window === 'undefined') return;
  ownershipRetryInstalled = true;
  window.addEventListener('online', () => {
    if (pendingPushOwnershipReset()) void initializeNativeFirebaseSecurity();
  });
}

function capacitorPlugin(name: string): CapacitorPlugin | null {
  if (typeof window === 'undefined') return null;
  const capacitor = (window as unknown as {
    Capacitor?: {
      registerPlugin?: (pluginName: string) => CapacitorPlugin;
      Plugins?: Record<string, CapacitorPlugin>;
    };
  }).Capacitor;
  if (!capacitor) return null;
  if (typeof capacitor.registerPlugin === 'function') return capacitor.registerPlugin(name);
  return capacitor.Plugins?.[name] || null;
}

function appVersion() {
  return String(import.meta.env.VITE_TUTOP_APP_VERSION || '0.9.2-beta.0').trim().slice(0, 40);
}

function intentFromEvent(event: any, source: NativeNotificationIntent['source']): NativeNotificationIntent {
  const notification = event?.notification || event || {};
  const data = notification?.data || event?.data || {};
  return {
    source,
    notification_id: String(data.notification_id || data.id || notification.id || '').trim() || undefined,
    kind: String(data.kind || '').trim() || undefined,
    chat_id: String(data.chat_id || '').trim() || undefined,
    listing_id: String(data.listing_id || data.product_id || '').trim() || undefined,
    transaction_id: String(data.transaction_id || '').trim() || undefined,
    saved_search_id: String(data.saved_search_id || '').trim() || undefined,
    recipient_uid: String(data.recipient_uid || '').trim() || undefined,
  };
}

function emitNotificationIntent(intent: NativeNotificationIntent) {
  if (typeof window === 'undefined') return;
  // After a fully-offline account switch, do not route any stale push inside
  // TuTop until the native registration token has been invalidated/reconciled.
  if (pendingPushOwnershipReset() || nativePushOptedOut()) return;
  window.dispatchEvent(new CustomEvent<NativeNotificationIntent>(NATIVE_NOTIFICATION_EVENT, { detail: intent }));
}

function currentPushSessionWitness(): PushSessionWitness | null {
  if (pendingPushOwnershipReset() || nativePushOptedOut()) return null;
  const identity = verifiedEmailBetaAuth.readSessionIdentity();
  if (!identity?.uid || !identity.refreshToken) return null;
  return { ...identity, generation: verifiedEmailBetaAuth.sessionGeneration(), epoch: pushRegistrationEpoch };
}
function isCurrentPushSession(witness: PushSessionWitness) {
  return matchesNativePushSession(
    witness, verifiedEmailBetaAuth.readSessionIdentity(),
    verifiedEmailBetaAuth.sessionGeneration(), pushRegistrationEpoch,
    pendingPushOwnershipReset(),
  );
}
async function registerToken(token: string, witness: PushSessionWitness) {
  if (!isCurrentPushSession(witness)) throw new Error('PUSH_OWNER_SESSION_CHANGED');
  const clean = token.trim();
  if (clean.length < 20 || clean.length > 4096) throw new Error('INVALID_PUSH_TOKEN');
  await pushBackend.registerDeviceToken(clean, 'android', appVersion(), () => isCurrentPushSession(witness));
}

export async function nativePushPermission(): Promise<PushPermission> {
  if (!isNativeFirebaseRuntime()) return 'unavailable';
  const messaging = capacitorPlugin('FirebaseMessaging');
  if (!messaging?.checkPermissions) return 'unavailable';
  try {
    const result = await messaging.checkPermissions();
    const receive = String(result?.receive || 'prompt') as PushPermission;
    return ['granted', 'denied', 'prompt', 'prompt-with-rationale'].includes(receive) ? receive : 'prompt';
  } catch {
    return 'unavailable';
  }
}

async function installMessagingListeners(messaging: CapacitorPlugin) {
  if (listenersInstalled || !messaging.addListener) return;
  // A partially registered listener set must not be treated as installed.
  // Coalesce simultaneous starts, then remove partial handlers before retry.
  if (listenerInstallation) return listenerInstallation;
  const attempt = (async () => {
    const handles: Array<{ remove?: () => Promise<void> }> = [];
    try {
      handles.push(await messaging.addListener('tokenReceived', async (_event: { token?: string }) => {
        // Never bind the event's potentially delayed token to a new account.
        // Re-read the native token behind a live Auth, permission and owner fence.
        const witness = currentPushSessionWitness();
        if (!witness) return;
        await syncGrantedPushTokenHealth(witness).catch(() => undefined);
      }));
      handles.push(await messaging.addListener('notificationReceived', async (event: unknown) => {
        emitNotificationIntent(intentFromEvent(event, 'received'));
      }));
      handles.push(await messaging.addListener('notificationActionPerformed', async (event: unknown) => {
        emitNotificationIntent(intentFromEvent(event, 'action'));
      }));
      listenersInstalled = true;
    } catch (error) {
      // Capacitor addListener returns a removable handle. Leave no duplicate
      // partially installed callbacks when one of the later listeners fails.
      await Promise.allSettled(handles.map(async (handle) => handle?.remove?.()));
      throw error;
    }
  })();
  listenerInstallation = attempt;
  try { await attempt; } finally { listenerInstallation = null; }
}

function classifyPushFailure(error: unknown): PushRegistrationReason {
  const message = String(error instanceof Error ? error.message : error || '');
  if (/API[_ -]?KEY|PERMISSION_DENIED|403|REQUEST_DENIED|API key not valid/i.test(message)) return 'firebase-config-rejected';
  if (/NETWORK|TIMEOUT|ECONN|ENET|fetch|offline/i.test(message)) return 'network-failure';
  return 'token-registration-failed';
}

async function syncGrantedPushTokenHealth(
  providedWitness?: PushSessionWitness,
): Promise<{ registered: boolean; reason: PushRegistrationReason }> {
  if (nativePushOptedOut()) return { registered: false, reason: 'user-opted-out' };
  const witness = providedWitness || currentPushSessionWitness();
  const denied = { registered: false, reason: 'ownership-reconciliation-pending' as PushRegistrationReason };
  if (!witness || !isCurrentPushSession(witness)) return denied;
  const messaging = capacitorPlugin('FirebaseMessaging');
  if (!messaging?.getToken) return { registered: false, reason: 'plugin-unavailable' };
  await installMessagingListeners(messaging);
  if (!isCurrentPushSession(witness)) return denied;
  const permission = await nativePushPermission();
  if (permission !== 'granted') return { registered: false, reason: 'permission-not-granted' };
  if (!isCurrentPushSession(witness)) return denied;
  let result: any;
  try { result = await messaging.getToken(); }
  catch (error) { return { registered: false, reason: classifyPushFailure(error) }; }
  // A delayed getToken from account A must not register as B after logout.
  if (!isCurrentPushSession(witness)) return denied;
  const token = String(result?.token || '').trim();
  if (!token) return { registered: false, reason: 'token-empty' };
  try { await registerToken(token, witness); }
  catch (error) {
    const classified = classifyPushFailure(error);
    return { registered: false, reason: classified === 'token-registration-failed' ? 'server-registration-failed' : classified };
  }
  return isCurrentPushSession(witness) ? { registered: true, reason: 'registered' } : denied;
}

async function syncGrantedPushToken() {
  return (await syncGrantedPushTokenHealth()).registered;
}

async function reconcilePendingPushOwnershipReset() {
  const pending = pendingPushOwnershipReset();
  if (!pending) return { pending: false, tokenDeleted: false };
  // An older asynchronous reconciliation cannot release a newer sign-out's gate.
  const cleanupEpoch = pushRegistrationEpoch;
  const messaging = capacitorPlugin('FirebaseMessaging');
  if (!messaging?.deleteToken) return { pending: true, tokenDeleted: false };

  const tokenDeleted = await bounded(
    messaging.deleteToken().then(() => true),
    1_500,
    false,
  );
  // Do not report reconciliation as complete when storage cannot clear/read back
  // the quarantine marker. A later native registration must remain blocked.
  const resetCleared = tokenDeleted && cleanupEpoch === pushRegistrationEpoch
    ? setPendingPushOwnershipReset(false)
    : false;
  return { pending: nativePushReconciliationStillPending(tokenDeleted, resetCleared) || pendingPushOwnershipReset(), tokenDeleted };
}

export async function initializeNativeFirebaseSecurity() {
  if (!isNativeFirebaseRuntime()) return;
  installPushOwnershipRetryListener();
  if (initialization) return initialization;
  const initialEpoch = pushRegistrationEpoch;
  const pending = (async () => {
    await initializeNativeAppCheck();
    // A sign-out invalidates old startup work before it can read the next UID.
    if (initialEpoch !== pushRegistrationEpoch) return;
    const messaging = capacitorPlugin('FirebaseMessaging');
    // Capacitor can expose Messaging after the first native startup probe.
    // Never memoize a completed initialization when the plugin is missing;
    // otherwise a later retry cannot install its FCM event listeners.
    if (!messaging?.getToken) {
      if (initialEpoch === pushRegistrationEpoch) initialization = null;
      return;
    }
    await installMessagingListeners(messaging);
    if (initialEpoch !== pushRegistrationEpoch) return;

    // If a previous account logged out fully offline, never register that same
    // native token under a new UID. Invalidate it first; a fresh token can then
    // be registered for the current account. The stale server record remains a
    // cleanup concern, but it no longer authorizes reuse on this device.
    const ownership = await reconcilePendingPushOwnershipReset();
    if (initialEpoch !== pushRegistrationEpoch) return;
    if (ownership.pending) {
      if (initialEpoch === pushRegistrationEpoch) initialization = null;
      return;
    }
    await syncGrantedPushToken().catch(() => false);
  })();
  initialization = pending;
  // A transient native plugin failure must not poison all future retries.
  // Do not clear a newer initialization started after sign-out.
  void pending.catch(() => { if (initialization === pending) initialization = null; });
  return pending;
}

export async function nativePushRegistrationHealth() {
  const permission = await nativePushPermission();
  // Health probes must never silently re-enable an explicit user opt-out.
  if (nativePushOptedOut()) {
    return { permission, tokenRegistered: false,
      ownershipReconciliationPending: pendingPushOwnershipReset(),
      reason: 'user-opted-out' as PushRegistrationReason };
  }
  if (permission !== 'granted') {
    return {
      permission,
      tokenRegistered: false,
      ownershipReconciliationPending: pendingPushOwnershipReset(),
      reason: 'permission-not-granted' as PushRegistrationReason,
    };
  }
  const ownership = await reconcilePendingPushOwnershipReset();
  if (ownership.pending) {
    return {
      permission,
      tokenRegistered: false,
      ownershipReconciliationPending: true,
      reason: 'ownership-reconciliation-pending' as PushRegistrationReason,
    };
  }
  const health = await syncGrantedPushTokenHealth();
  return { permission, tokenRegistered: health.registered, ownershipReconciliationPending: false, reason: health.reason };
}

export async function enableNativePushNotifications() {
  if (!isNativeFirebaseRuntime()) return { enabled: false, permission: 'unavailable' as PushPermission, reason: 'plugin-unavailable' as PushRegistrationReason };
  const messaging = capacitorPlugin('FirebaseMessaging');
  if (!messaging?.requestPermissions || !messaging?.getToken) {
    return { enabled: false, permission: 'unavailable' as PushPermission, reason: 'plugin-unavailable' as PushRegistrationReason };
  }
  // Only a direct user action may clear the stored per-owner opt-out.
  const uid = verifiedEmailBetaAuth.readSessionIdentity()?.uid || '';
  if (!uid || !setNativePushOptOut(uid, false)) {
    return { enabled: false, permission: await nativePushPermission(), reason: 'preference-storage-unavailable' as PushRegistrationReason };
  }
  pushRegistrationEpoch += 1;
  await initializeNativeFirebaseSecurity();
  let permission = await nativePushPermission();
  if (permission !== 'granted') {
    try {
      const result = await messaging.requestPermissions();
      permission = String(result?.receive || 'denied') as PushPermission;
    } catch (error) {
      return { enabled: false, permission, reason: classifyPushFailure(error), ownershipReconciliationPending: false };
    }
  }
  if (permission !== 'granted') {
    return { enabled: false, permission, reason: 'permission-not-granted' as PushRegistrationReason, ownershipReconciliationPending: false };
  }
  const ownership = await reconcilePendingPushOwnershipReset();
  if (ownership.pending) {
    return { enabled: false, permission, reason: 'ownership-reconciliation-pending' as PushRegistrationReason, ownershipReconciliationPending: true };
  }
  const health = await syncGrantedPushTokenHealth();
  return { enabled: health.registered, permission, reason: health.reason, ownershipReconciliationPending: false };
}

export async function disableNativePushNotifications() {
  if (!isNativeFirebaseRuntime()) return false;
  const owner = verifiedEmailBetaAuth.readSessionIdentity();
  if (!owner?.uid || !setNativePushOptOut(owner.uid, true)) return false;
  // Invalidate queued tokenReceived callbacks before native token deletion.
  pushRegistrationEpoch += 1;
  const generation = verifiedEmailBetaAuth.sessionGeneration();
  const isSameOwner = () => {
    const live = verifiedEmailBetaAuth.readSessionIdentity();
    return live?.uid === owner.uid && live?.refreshToken === owner.refreshToken
      && verifiedEmailBetaAuth.sessionGeneration() === generation;
  };
  const messaging = capacitorPlugin('FirebaseMessaging');
  if (!messaging?.getToken || !messaging?.deleteToken) return false;
  try {
    const result = await messaging.getToken();
    if (!isSameOwner()) return false;
    const token = String(result?.token || '').trim();
    if (token) await pushBackend.unregisterDeviceToken(token, 'android').catch(() => undefined);
    if (!isSameOwner()) return false;
    await messaging.deleteToken();
    return isSameOwner();
  } catch {
    return false;
  }
}

function bounded<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  return Promise.race([
    promise.catch(() => fallback),
    new Promise<T>((resolve) => window.setTimeout(() => resolve(fallback), timeoutMs)),
  ]);
}

/**
 * Best-effort push ownership cleanup before account sign-out.
 * The old authenticated session is still present when this runs, so TuTop can
 * deactivate the UID-scoped token mapping. Native deleteToken is also attempted
 * so an offline/server-cleanup failure does not intentionally keep reusing the
 * same registration token for the next account.
 *
 * Logout must remain available even on bad networks; callers should bound this
 * operation and then clear auth regardless of the result.
 */
export async function prepareNativePushForAccountSignOut() {
  pushRegistrationEpoch += 1;
  initialization = null;
  // Another logout or explicit opt-in can supersede an in-flight cleanup.
  const cleanupEpoch = pushRegistrationEpoch;
  if (!isNativeFirebaseRuntime()) return { serverDeactivated: false, tokenDeleted: false };

  // Persist the previous owner's token quarantine BEFORE any async work.
  // Missing native plugins or process interruption must not silently permit
  // registration of a still-owned token under the next signed-in UID.
  setPendingPushOwnershipReset(true);
  const messaging = capacitorPlugin('FirebaseMessaging');
  if (!messaging?.getToken) return { serverDeactivated: false, tokenDeleted: false, ownershipResetQueued: true };

  let token = '';
  try {
    const result = await bounded(messaging.getToken(), 1_500, null as any);
    token = String(result?.token || '').trim();
  } catch {
    token = '';
  }

  let serverDeactivated = false;
  if (token) {
    serverDeactivated = await bounded(
      pushBackend.unregisterDeviceToken(token, 'android').then(() => true),
      1_500,
      false,
    );
  }

  let tokenDeleted = false;
  if (messaging.deleteToken) {
    tokenDeleted = await bounded(
      messaging.deleteToken().then(() => true),
      1_500,
      false,
    );
  }

  // A successful server unregister does not invalidate a native token. If
  // deleteToken failed, keep the quarantine before a different UID logs in.
  // A stale cleanup must not clear a newer session's quarantine marker.
  const ownershipResetQueued = needsNativePushOwnershipReset(tokenDeleted)
    || cleanupEpoch !== pushRegistrationEpoch
    || !setPendingPushOwnershipReset(false);

  if (cleanupEpoch === pushRegistrationEpoch) initialization = null;
  return { serverDeactivated, tokenDeleted, ownershipResetQueued };
}
