import { getCachedApproxLocation, requestApproxLocation } from './nearbyMarketplace';
import { queryTopiVoicePermission, requestTopiVoicePermission } from './topiVoice';
import { isNativeDeviceRuntime, nativeCameraPermission, nativeLocationPermission } from '../services/nativeDeviceCapabilities';
import { enableNativePushNotifications, nativePushPermission } from '../services/nativeFirebaseSecurity';

export type CapabilityPermission = 'location' | 'camera' | 'microphone' | 'notifications';
export type PermissionState091 = 'granted' | 'prompt' | 'denied' | 'unsupported' | 'unknown';

const PERMISSION_NAMES: Partial<Record<CapabilityPermission, string>> = {
  location: 'geolocation', camera: 'camera', microphone: 'microphone', notifications: 'notifications',
};

function normalizeNativeState(value: string): PermissionState091 {
  if (value === 'granted') return 'granted';
  if (value === 'denied') return 'denied';
  if (value === 'prompt' || value === 'prompt-with-rationale') return 'prompt';
  if (value === 'unavailable' || value === 'unsupported') return 'unsupported';
  return 'unknown';
}

export async function queryCapabilityPermission(capability: CapabilityPermission): Promise<PermissionState091> {
  if (capability === 'location' && getCachedApproxLocation()) return 'granted';
  if (isNativeDeviceRuntime()) {
    if (capability === 'location') return normalizeNativeState(await nativeLocationPermission(false));
    // Camera 8 uses Android's system camera/photo picker and deliberately does
    // not request legacy broad CAMERA/storage permission. Here "granted" means
    // the native picker capability is installed and available, not that TuTop
    // owns unrestricted camera access.
    if (capability === 'camera') return normalizeNativeState(await nativeCameraPermission());
    if (capability === 'microphone') return normalizeNativeState(await queryTopiVoicePermission());
    if (capability === 'notifications') return normalizeNativeState(await nativePushPermission());
  }
  if (capability === 'notifications') {
    if (typeof Notification === 'undefined') return 'unsupported';
    const state = Notification.permission;
    return state === 'granted' ? 'granted' : state === 'denied' ? 'denied' : 'prompt';
  }
  try {
    if (!navigator.permissions?.query) return 'unknown';
    const name = PERMISSION_NAMES[capability];
    if (!name) return 'unknown';
    const result = await (navigator.permissions as any).query({ name });
    const state = String(result?.state || 'unknown');
    return state === 'granted' || state === 'prompt' || state === 'denied' ? state : 'unknown';
  } catch { return 'unknown'; }
}

async function requestBrowserMedia(kind: 'camera' | 'microphone'): Promise<PermissionState091> {
  if (!navigator.mediaDevices?.getUserMedia) return 'unsupported';
  let stream: MediaStream | null = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia(kind === 'camera' ? { video: true, audio: false } : { audio: true, video: false });
    return 'granted';
  } catch (error) {
    const name = error instanceof DOMException ? error.name : '';
    if (/NotAllowedError|SecurityError/i.test(name)) return 'denied';
    if (/NotFoundError|DevicesNotFoundError/i.test(name)) return 'unsupported';
    return 'unknown';
  } finally {
    for (const track of stream?.getTracks() || []) track.stop();
  }
}

export async function requestCapabilityPermission(capability: CapabilityPermission): Promise<PermissionState091> {
  if (capability === 'location') {
    const location = await requestApproxLocation({ timeoutMs: 15_000, maximumAgeMs: 10 * 60_000, requestPermission: true });
    if (location) return 'granted';
    const state = await queryCapabilityPermission('location');
    return state === 'unknown' ? 'denied' : state;
  }
  if (capability === 'camera' && isNativeDeviceRuntime()) return normalizeNativeState(await nativeCameraPermission());
  if (capability === 'microphone' && isNativeDeviceRuntime()) return normalizeNativeState(await requestTopiVoicePermission());
  if (capability === 'notifications' && isNativeDeviceRuntime()) {
    const result = await enableNativePushNotifications();
    return normalizeNativeState(result.permission);
  }
  if (capability === 'notifications') {
    if (typeof Notification === 'undefined' || !Notification.requestPermission) return 'unsupported';
    const state = await Notification.requestPermission();
    return state === 'granted' ? 'granted' : state === 'denied' ? 'denied' : 'prompt';
  }
  return requestBrowserMedia(capability);
}

export const PERMISSION_PRIVACY_COPY: Record<CapabilityPermission, string> = {
  location: 'Se usa sólo para calcular cercanía. TuTop guarda una ubicación aproximada (~1 km), no tu domicilio exacto.',
  camera: 'TuTop abre la cámara o el selector de fotos del sistema sólo cuando tú lo eliges al publicar. No pide acceso permanente ni almacenamiento legacy.',
  microphone: 'Se solicita sólo cuando tocas el micrófono de Topi. El audio no se guarda ni se sube por TuTop.',
  notifications: 'Se usan para avisarte de mensajes y actividad relevante. Puedes desactivarlas desde Android cuando quieras.',
};
