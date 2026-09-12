import { getCachedApproxLocation, requestApproxLocation } from './nearbyMarketplace';

export type CapabilityPermission = 'location' | 'camera' | 'microphone';
export type PermissionState091 = 'granted' | 'prompt' | 'denied' | 'unsupported' | 'unknown';

const PERMISSION_NAMES: Record<CapabilityPermission, string> = {
  location: 'geolocation',
  camera: 'camera',
  microphone: 'microphone',
};

export async function queryCapabilityPermission(capability: CapabilityPermission): Promise<PermissionState091> {
  if (capability === 'location' && getCachedApproxLocation()) return 'granted';
  try {
    if (!navigator.permissions?.query) return 'unknown';
    const result = await (navigator.permissions as any).query({ name: PERMISSION_NAMES[capability] });
    const state = String(result?.state || 'unknown');
    return state === 'granted' || state === 'prompt' || state === 'denied' ? state : 'unknown';
  } catch {
    return 'unknown';
  }
}

async function requestMedia(kind: 'camera' | 'microphone'): Promise<PermissionState091> {
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
    const location = await requestApproxLocation({ timeoutMs: 10_000, maximumAgeMs: 60_000 });
    if (location) return 'granted';
    const state = await queryCapabilityPermission('location');
    return state === 'unknown' ? 'denied' : state;
  }
  return requestMedia(capability);
}

export const PERMISSION_PRIVACY_COPY: Record<CapabilityPermission, string> = {
  location: 'Se usa sólo para calcular cercanía. TuTop guarda una ubicación aproximada (~1 km), no tu domicilio exacto.',
  camera: 'Se solicita sólo cuando quieres tomar una foto para una publicación. La prueba no conserva imágenes.',
  microphone: 'Se solicita sólo cuando usas dictado con Topi. La prueba no guarda ni sube audio.',
};
