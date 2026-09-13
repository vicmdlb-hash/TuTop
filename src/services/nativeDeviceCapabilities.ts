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

async function readNativePosition(geolocation: CapacitorPlugin, timeoutMs: number, maximumAgeMs: number) {
  const position = await geolocation.getCurrentPosition({
    enableHighAccuracy: false,
    timeout: timeoutMs,
    maximumAge: maximumAgeMs,
    enableLocationFallback: true,
  });
  const latitude = Number(position?.coords?.latitude);
  const longitude = Number(position?.coords?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  const accuracy = Number(position?.coords?.accuracy);
  return { latitude, longitude, ...(Number.isFinite(accuracy) ? { accuracy } : {}) } as NativeApproxPosition;
}

export async function getNativeApproxPosition(options: { requestPermission?: boolean; timeoutMs?: number; maximumAgeMs?: number } = {}): Promise<NativeApproxPosition | null> {
  if (!isNativeDeviceRuntime()) return null;
  const geolocation = plugin('Geolocation');
  if (!geolocation?.getCurrentPosition) return null;
  const state = await nativeLocationPermission(options.requestPermission !== false);
  if (state !== 'granted') return null;

  const timeoutMs = options.timeoutMs ?? 15_000;
  const maximumAgeMs = options.maximumAgeMs ?? 10 * 60_000;
  try {
    return await readNativePosition(geolocation, timeoutMs, maximumAgeMs);
  } catch {
    // Some Android devices need a second foreground request after the permission
    // sheet closes or while Google Play location settings are warming up.
    try {
      await new Promise((resolve) => window.setTimeout(resolve, 350));
      return await readNativePosition(geolocation, Math.max(timeoutMs, 20_000), Math.max(maximumAgeMs, 30 * 60_000));
    } catch {
      return null;
    }
  }
}

/**
 * Capacitor Camera 8.1+ exposes takePhoto/chooseFromGallery as separate APIs.
 * Android uses the system camera/photo picker, so TuTop does not need legacy
 * CAMERA/storage permissions when saveToGallery=false.
 */
export async function nativeCameraPermission(): Promise<DevicePermissionState> {
  if (!isNativeDeviceRuntime()) return 'unavailable';
  const camera = plugin('Camera');
  return camera?.takePhoto || camera?.chooseFromGallery || camera?.getPhoto ? 'granted' : 'unavailable';
}

function mediaResult(result: any, source: NativePhoto['source']): NativePhoto | null {
  if (!result || typeof result !== 'object') return null;
  const webPath = String(result.webPath || '').trim() || undefined;
  const uri = String(result.uri || result.path || '').trim() || undefined;
  const thumbnail = String(result.thumbnail || result.base64String || '').trim() || undefined;
  const format = String(result.metadata?.format || result.format || '').trim().toLowerCase() || undefined;
  if (!webPath && !uri && !thumbnail) return null;
  return { source, webPath, uri, thumbnail, format };
}

function nativeMediaError(error: unknown, source: 'camera' | 'photos') {
  const value = error as { code?: string; message?: string } | null;
  const code = String(value?.code || '').trim();
  if (code === 'OS-PLUG-CAMR-0006' || code === 'OS-PLUG-CAMR-0020') return null;
  if (code === 'OS-PLUG-CAMR-0003' || code === 'OS-PLUG-CAMR-0007') return new Error('No pudimos abrir la cámara del teléfono. Revisa que otra app no la esté usando e inténtalo otra vez.');
  if (code === 'OS-PLUG-CAMR-0005' || code === 'OS-PLUG-CAMR-0018' || code === 'OS-PLUG-CAMR-0021') return new Error('No pudimos abrir tus fotos. Revisa el selector de fotos de Android e inténtalo otra vez.');
  if (code === 'OS-PLUG-CAMR-0027' || code === 'OS-PLUG-CAMR-0028') return new Error('Android devolvió una foto que ya no está disponible. Elige otra imagen.');
  const message = String(value?.message || '').trim();
  if (/cancel/i.test(message)) return null;
  return new Error(source === 'camera' ? 'No pudimos tomar la foto. Inténtalo otra vez.' : 'No pudimos seleccionar la foto. Inténtalo otra vez.');
}

async function getNativePhoto(source: 'camera' | 'photos'): Promise<NativePhoto | null> {
  if (!isNativeDeviceRuntime()) return null;
  const camera = plugin('Camera');
  if (!camera) return null;

  try {
    if (source === 'camera' && camera.takePhoto) {
      const result = await camera.takePhoto({
        quality: 82,
        targetWidth: 1280,
        targetHeight: 1280,
        correctOrientation: true,
        saveToGallery: false,
        cameraDirection: 'REAR',
        editable: 'no',
        includeMetadata: true,
      });
      return mediaResult(result, 'camera');
    }

    if (source === 'photos' && camera.chooseFromGallery) {
      const result = await camera.chooseFromGallery({
        mediaType: 0,
        allowMultipleSelection: false,
        limit: 1,
        quality: 82,
        targetWidth: 1280,
        targetHeight: 1280,
        correctOrientation: true,
        editable: 'no',
        includeMetadata: true,
      });
      const selected = Array.isArray(result?.results) ? result.results[0] : null;
      return mediaResult(selected, 'photos');
    }

    // Compatibility only for devices carrying a pre-8.1 Camera bridge.
    if (camera.getPhoto) {
      const result = await camera.getPhoto({
        quality: 82,
        width: 1280,
        height: 1280,
        source: source === 'camera' ? 'CAMERA' : 'PHOTOS',
        resultType: 'uri',
        direction: 'REAR',
        allowEditing: false,
        saveToGallery: false,
        correctOrientation: true,
        presentationStyle: 'fullscreen',
      });
      return mediaResult(result, source);
    }
    return null;
  } catch (error) {
    const mapped = nativeMediaError(error, source);
    if (mapped) throw mapped;
    return null;
  }
}

export async function takeNativePhoto() {
  return getNativePhoto('camera');
}

export async function pickNativePhoto() {
  return getNativePhoto('photos');
}

export async function nativePhotoToImageFile(photo: NativePhoto, filename = 'tutop-photo.jpg') {
  let source = photo.webPath || '';
  if (!source && photo.thumbnail) {
    const rawFormat = photo.format && /^[a-z0-9.+-]+$/.test(photo.format) ? photo.format : 'jpeg';
    const format = rawFormat === 'jpg' ? 'jpeg' : rawFormat;
    source = `data:image/${format};base64,${photo.thumbnail}`;
  }
  if (!source && photo.uri && typeof window !== 'undefined') {
    const convertFileSrc = (window as unknown as { Capacitor?: { convertFileSrc?: (path: string) => string } }).Capacitor?.convertFileSrc;
    source = convertFileSrc ? convertFileSrc(photo.uri) : photo.uri;
  }
  if (!source) throw new Error('No pudimos leer la foto seleccionada.');
  const response = await fetch(source);
  if (!response.ok && !source.startsWith('data:') && !source.startsWith('blob:')) throw new Error('No pudimos abrir la foto seleccionada.');
  const blob = await response.blob();
  if (!blob.type.startsWith('image/')) throw new Error('La selección no contiene una imagen válida.');
  return new File([blob], filename, { type: blob.type || 'image/jpeg' });
}
