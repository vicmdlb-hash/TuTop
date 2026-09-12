type CapacitorPlugin = Record<string, (...args: any[]) => Promise<any>>;
type CapacitorRuntime = {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  registerPlugin?: (name: string) => CapacitorPlugin;
  Plugins?: Record<string, CapacitorPlugin>;
};

export type DevicePermissionState = 'granted' | 'denied' | 'prompt' | 'prompt-with-rationale' | 'unavailable';
export type NativeApproxPosition = { latitude: number; longitude: number; accuracy?: number };
export type NativePhoto = { dataUrl: string; source: 'camera' | 'photos' };

function runtime(): CapacitorRuntime | null {
  if (typeof window === 'undefined') return null;
  return (window as unknown as { Capacitor?: CapacitorRuntime }).Capacitor || null;
}

export function isNativeDeviceRuntime() {
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

function permission(value: unknown): DevicePermissionState {
  const normalized = String(value || 'prompt') as DevicePermissionState;
  return ['granted', 'denied', 'prompt', 'prompt-with-rationale'].includes(normalized) ? normalized : 'unavailable';
}

export async function nativeLocationPermission(request = false): Promise<DevicePermissionState> {
  if (!isNativeDeviceRuntime()) return 'unavailable';
  const geolocation = plugin('Geolocation');
  if (!geolocation?.checkPermissions) return 'unavailable';
  try {
    let status = await geolocation.checkPermissions();
    let coarse = permission(status?.coarseLocation ?? status?.location);
    if (request && coarse !== 'granted' && geolocation.requestPermissions) {
      status = await geolocation.requestPermissions({ permissions: ['coarseLocation'] });
      coarse = permission(status?.coarseLocation ?? status?.location);
    }
    return coarse;
  } catch {
    return 'unavailable';
  }
}

export async function getNativeApproxPosition(options: { requestPermission?: boolean; timeoutMs?: number; maximumAgeMs?: number } = {}): Promise<NativeApproxPosition | null> {
  if (!isNativeDeviceRuntime()) return null;
  const geolocation = plugin('Geolocation');
  if (!geolocation?.getCurrentPosition) return null;
  const state = await nativeLocationPermission(options.requestPermission !== false);
  if (state !== 'granted') return null;
  try {
    const position = await geolocation.getCurrentPosition({
      enableHighAccuracy: false,
      timeout: options.timeoutMs ?? 8000,
      maximumAge: options.maximumAgeMs ?? 10 * 60_000,
      enableLocationFallback: true,
    });
    const latitude = Number(position?.coords?.latitude);
    const longitude = Number(position?.coords?.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    const accuracy = Number(position?.coords?.accuracy);
    return { latitude, longitude, ...(Number.isFinite(accuracy) ? { accuracy } : {}) };
  } catch {
    return null;
  }
}

export async function nativeCameraPermission(request = false): Promise<DevicePermissionState> {
  if (!isNativeDeviceRuntime()) return 'unavailable';
  const camera = plugin('Camera');
  if (!camera?.checkPermissions) return 'unavailable';
  try {
    let status = await camera.checkPermissions();
    let cameraState = permission(status?.camera);
    if (request && cameraState !== 'granted' && camera.requestPermissions) {
      status = await camera.requestPermissions({ permissions: ['camera'] });
      cameraState = permission(status?.camera);
    }
    return cameraState;
  } catch {
    return 'unavailable';
  }
}

async function getNativePhoto(source: 'CAMERA' | 'PHOTOS'): Promise<NativePhoto | null> {
  if (!isNativeDeviceRuntime()) return null;
  const camera = plugin('Camera');
  if (!camera?.getPhoto) return null;
  if (source === 'CAMERA') {
    const permissionState = await nativeCameraPermission(true);
    if (permissionState !== 'granted') return null;
  }
  try {
    const result = await camera.getPhoto({
      source,
      resultType: 'dataUrl',
      quality: 82,
      width: 1280,
      height: 1280,
      correctOrientation: true,
      allowEditing: false,
      saveToGallery: false,
      promptLabelHeader: 'Foto para TuTop',
      promptLabelPhoto: 'Galería',
      promptLabelPicture: 'Cámara',
    });
    const dataUrl = String(result?.dataUrl || '').trim();
    if (!dataUrl.startsWith('data:image/')) return null;
    return { dataUrl, source: source === 'CAMERA' ? 'camera' : 'photos' };
  } catch {
    return null;
  }
}

export function takeNativePhoto() {
  return getNativePhoto('CAMERA');
}

export function pickNativePhoto() {
  return getNativePhoto('PHOTOS');
}

export async function dataUrlToImageFile(dataUrl: string, filename = 'tutop-photo.jpg') {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  if (!blob.type.startsWith('image/')) throw new Error('La selección no contiene una imagen válida.');
  return new File([blob], filename, { type: blob.type || 'image/jpeg' });
}
