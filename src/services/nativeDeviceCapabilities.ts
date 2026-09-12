type CapacitorPlugin = Record<string, (...args: any[]) => Promise<any>>;
type CapacitorRuntime = {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  registerPlugin?: (name: string) => CapacitorPlugin;
  Plugins?: Record<string, CapacitorPlugin>;
};

export type DevicePermissionState = 'granted' | 'denied' | 'prompt' | 'prompt-with-rationale' | 'limited' | 'unavailable';
export type NativeApproxPosition = { latitude: number; longitude: number; accuracy?: number };
export type NativePhoto = {
  source: 'camera' | 'photos';
  webPath?: string;
  uri?: string;
  thumbnail?: string;
  format?: string;
};

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
  return ['granted', 'denied', 'prompt', 'prompt-with-rationale', 'limited'].includes(normalized) ? normalized : 'unavailable';
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

export async function nativeCameraPermission(): Promise<DevicePermissionState> {
  if (!isNativeDeviceRuntime()) return 'unavailable';
  const camera = plugin('Camera');
  if (!camera?.checkPermissions) return 'unavailable';
  try {
    const status = await camera.checkPermissions();
    return permission(status?.camera);
  } catch {
    return 'unavailable';
  }
}

function mediaResult(result: any, source: NativePhoto['source']): NativePhoto | null {
  if (!result || typeof result !== 'object') return null;
  const metadata = result.metadata && typeof result.metadata === 'object' ? result.metadata : {};
  const webPath = String(result.webPath || '').trim() || undefined;
  const uri = String(result.uri || '').trim() || undefined;
  const thumbnail = String(result.thumbnail || '').trim() || undefined;
  const format = String(metadata.format || '').trim().toLowerCase() || undefined;
  if (!webPath && !uri && !thumbnail) return null;
  return { source, webPath, uri, thumbnail, format };
}

export async function takeNativePhoto(): Promise<NativePhoto | null> {
  if (!isNativeDeviceRuntime()) return null;
  const camera = plugin('Camera');
  if (!camera?.takePhoto) return null;
  try {
    // Capacitor Camera 8 uses a system camera activity on Android; no legacy
    // storage permission is needed and saveToGallery remains false.
    const result = await camera.takePhoto({
      quality: 82,
      targetWidth: 1280,
      targetHeight: 1280,
      cameraDirection: 'REAR',
      editable: 'no',
      saveToGallery: false,
      includeMetadata: true,
    });
    return mediaResult(result, 'camera');
  } catch {
    return null;
  }
}

export async function pickNativePhoto(): Promise<NativePhoto | null> {
  if (!isNativeDeviceRuntime()) return null;
  const camera = plugin('Camera');
  if (!camera?.chooseFromGallery) return null;
  try {
    const result = await camera.chooseFromGallery({
      quality: 82,
      targetWidth: 1280,
      targetHeight: 1280,
      allowMultipleSelection: false,
      includeMetadata: true,
      editable: 'no',
      mediaType: 0,
    });
    return mediaResult(Array.isArray(result?.results) ? result.results[0] : null, 'photos');
  } catch {
    return null;
  }
}

export async function nativePhotoToImageFile(photo: NativePhoto, filename = 'tutop-photo.jpg') {
  let source = photo.webPath || '';
  if (!source && photo.thumbnail) {
    const format = photo.format && /^[a-z0-9.+-]+$/.test(photo.format) ? photo.format : 'jpeg';
    source = `data:image/${format};base64,${photo.thumbnail}`;
  }
  if (!source) throw new Error('No pudimos leer la foto seleccionada.');
  const response = await fetch(source);
  if (!response.ok && !source.startsWith('data:') && !source.startsWith('blob:')) throw new Error('No pudimos abrir la foto seleccionada.');
  const blob = await response.blob();
  if (!blob.type.startsWith('image/')) throw new Error('La selección no contiene una imagen válida.');
  return new File([blob], filename, { type: blob.type || 'image/jpeg' });
}
