import { pushBackend } from './pushBackend';
import { initializeNativeAppCheck, isNativeFirebaseRuntime } from './nativeAppCheckToken';

type CapacitorPlugin = Record<string, (...args: any[]) => Promise<any>>;
type PushPermission = 'granted' | 'denied' | 'prompt' | 'prompt-with-rationale' | 'unavailable';

export type NativeNotificationIntent = {
  source: 'received' | 'action';
  notification_id?: string;
  kind?: string;
  chat_id?: string;
  listing_id?: string;
  transaction_id?: string;
  saved_search_id?: string;
};

export const NATIVE_NOTIFICATION_EVENT = 'tutop:native-notification';

let initialization: Promise<void> | null = null;
let listenersInstalled = false;

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
  };
}

function emitNotificationIntent(intent: NativeNotificationIntent) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<NativeNotificationIntent>(NATIVE_NOTIFICATION_EVENT, { detail: intent }));
}

async function registerToken(token: string) {
  const clean = token.trim();
  if (clean.length < 20) return;
  await pushBackend.registerDeviceToken(clean, 'android', appVersion());
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
  listenersInstalled = true;
  await messaging.addListener('tokenReceived', async (event: { token?: string }) => {
    const token = String(event?.token || '').trim();
    if (!token) return;
    await registerToken(token).catch(() => undefined);
  });
  await messaging.addListener('notificationReceived', async (event: unknown) => {
    emitNotificationIntent(intentFromEvent(event, 'received'));
  });
  await messaging.addListener('notificationActionPerformed', async (event: unknown) => {
    emitNotificationIntent(intentFromEvent(event, 'action'));
  });
}

async function syncGrantedPushToken() {
  const messaging = capacitorPlugin('FirebaseMessaging');
  if (!messaging?.getToken) return false;
  await installMessagingListeners(messaging);
  const permission = await nativePushPermission();
  if (permission !== 'granted') return false;
  const result = await messaging.getToken();
  const token = String(result?.token || '').trim();
  if (!token) return false;
  await registerToken(token);
  return true;
}

export async function initializeNativeFirebaseSecurity() {
  if (!isNativeFirebaseRuntime()) return;
  if (initialization) return initialization;
  initialization = (async () => {
    await initializeNativeAppCheck();
    const messaging = capacitorPlugin('FirebaseMessaging');
    if (messaging) await installMessagingListeners(messaging);
    await syncGrantedPushToken().catch(() => false);
  })();
  return initialization;
}

export async function nativePushRegistrationHealth() {
  const permission = await nativePushPermission();
  if (permission !== 'granted') return { permission, tokenRegistered: false };
  const tokenRegistered = await syncGrantedPushToken().catch(() => false);
  return { permission, tokenRegistered };
}

export async function enableNativePushNotifications() {
  if (!isNativeFirebaseRuntime()) return { enabled: false, permission: 'unavailable' as PushPermission };
  const messaging = capacitorPlugin('FirebaseMessaging');
  if (!messaging?.requestPermissions || !messaging?.getToken) return { enabled: false, permission: 'unavailable' as PushPermission };
  await initializeNativeFirebaseSecurity();
  let permission = await nativePushPermission();
  if (permission !== 'granted') {
    const result = await messaging.requestPermissions();
    permission = String(result?.receive || 'denied') as PushPermission;
  }
  if (permission !== 'granted') return { enabled: false, permission };
  const enabled = await syncGrantedPushToken();
  return { enabled, permission };
}

export async function disableNativePushNotifications() {
  if (!isNativeFirebaseRuntime()) return false;
  const messaging = capacitorPlugin('FirebaseMessaging');
  if (!messaging?.getToken || !messaging?.deleteToken) return false;
  try {
    const result = await messaging.getToken();
    const token = String(result?.token || '').trim();
    if (token) await pushBackend.unregisterDeviceToken(token, 'android').catch(() => undefined);
    await messaging.deleteToken();
    return true;
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
  initialization = null;
  if (!isNativeFirebaseRuntime()) return { serverDeactivated: false, tokenDeleted: false };

  const messaging = capacitorPlugin('FirebaseMessaging');
  if (!messaging?.getToken) return { serverDeactivated: false, tokenDeleted: false };

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

  initialization = null;
  return { serverDeactivated, tokenDeleted };
}
