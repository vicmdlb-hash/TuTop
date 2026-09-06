import { pushBackend } from './pushBackend';
import { initializeNativeAppCheck, isNativeFirebaseRuntime } from './nativeAppCheckToken';

type CapacitorPlugin = Record<string, (...args: any[]) => Promise<any>>;
type PushPermission = 'granted' | 'denied' | 'prompt' | 'prompt-with-rationale' | 'unavailable';

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
  return String(import.meta.env.VITE_TUTOP_APP_VERSION || '0.8.5-beta').trim().slice(0, 40);
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
    // App Check initializes immediately so REST calls can attach a token when available.
    // Push permission is NOT requested here; token sync happens only if permission was
    // already granted. The user chooses whether to enable notifications in settings.
    await initializeNativeAppCheck();
    await syncGrantedPushToken().catch(() => false);
  })();
  return initialization;
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
