type CapacitorPlugin = Record<string, (...args: any[]) => Promise<any>>;
type CapacitorRuntime = {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  isPluginAvailable?: (name: string) => boolean;
  registerPlugin?: (name: string) => CapacitorPlugin;
  Plugins?: Record<string, CapacitorPlugin>;
  convertFileSrc?: (path: string) => string;
};

export type DevicePermissionState = 'granted' | 'denied' | 'prompt' | 'unavailable';
export type NativeLocationFailure = 'none' | 'permission-denied' | 'services-disabled' | 'timeout' | 'plugin-unavailable' | 'position-unavailable' | 'unknown';
export type NativeApproxPosition = { latitude: number; longitude: number; accuracy?: number };
export type NativePhoto = {
  uri?: string;
  webPath?: string;
  thumbnail?: string;
  format?: string;
  source: 'camera' | 'photos';
};

let lastLocationFailure: NativeLocationFailure = 'none';

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
  if (typeof capacitor.isPluginAvailable === 'function' && !capacitor.isPluginAvailable(name)) return null;
  if (typeof capacitor.registerPlugin === 'function') return capacitor.registerPlugin(name);
  return capacitor.Plugins?.[name] || null;
}

function permissionState(value: unknown): DevicePermissionState {
  const clean = String(value || '').toLowerCase();
  if (clean === 'granted' || clean === 'limited') return 'granted';
  if (clean === 'denied') return 'denied';
  if (clean === 'prompt' || clean === 'prompt-with-rationale') return 'prompt';
  return 'unavailable';
}

function locationFailure(error: unknown): NativeLocationFailure {
  const code = String((error as { code?: unknown })?.code || '');
  const message = String((error as { message?: unknown })?.message || error || '');
  if (/OS-PLUG-GLOC-0003|permission/i.test(`${code} ${message}`)) return 'permission-denied';
  if (/OS-PLUG-GLOC-0007|location services|settings/i.test(`${code} ${message}`)) return 'services-disabled';
  if (/OS-PLUG-GLOC-0010|timeout/i.test(`${code} ${message}`)) return 'timeout';
  if (/not implemented|unavailable|missing plugin/i.test(`${code} ${message}`)) return 'plugin-unavailable';
  if (/OS-PLUG-GLOC-0002|position unavailable/i.test(`${code} ${message}`)) return 'position-unavailable';
  return 'unknown';
}

export function nativeLocationDiagnostic() {
  return lastLocationFailure;
}

export async function nativeLocationPermission(request = false): Promise<DevicePermissionState> {
  if (!isNativeDeviceRuntime()) return 'unavailable';
  const geolocation = plugin('Geolocation');
  if (!geolocation?.checkPermissions) return 'unavailable';
  try {
    let result = await geolocation.checkPermissions();
    let state = permissionState(result?.coarseLocation ?? result?.location);
    if (request && state !== 'granted' && geolocation.requestPermissions) {
      result = await geolocation.requestPermissions({ permissions: ['coarseLocation'] });
      state = permissionState(result?.coarseLocation ?? result?.location);
    }
    lastLocationFailure = state === 'denied' ? 'permission-denied' : 'none';
    return state;
  } catch (error) {
    lastLocationFailure = locationFailure(error);
    return lastLocationFailure === 'permission-denied' ? 'denied' : 'unavailable';
  }
}

function positionFromResult(result: any): NativeApproxPosition | null {
  const latitude = Number(result?.coords?.latitude);
  const longitude = Number(result?.coords?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  const accuracy = Number(result?.coords?.accuracy);
  return { latitude, longitude, ...(Number.isFinite(accuracy) ? { accuracy } : {}) };
}

export async function getNativeApproxPosition(options: { requestPermission?: boolean; timeoutMs?: number; maximumAgeMs?: number } = {}): Promise<NativeApproxPosition | null> {
  if (!isNativeDeviceRuntime()) { lastLocationFailure = 'plugin-unavailable'; return null; }
  const geolocation = plugin('Geolocation');
  if (!geolocation?.getCurrentPosition) { lastLocationFailure = 'plugin-unavailable'; return null; }
  const permission = await nativeLocationPermission(options.requestPermission !== false);
  if (permission !== 'granted') return null;

  const requestOptions = {
    enableHighAccuracy: false,
    timeout: Math.max(3_000, options.timeoutMs ?? 15_000),
    maximumAge: Math.max(0, options.maximumAgeMs ?? 10 * 60_000),
    enableLocationFallback: true,
  };

  try {
    const direct = positionFromResult(await geolocation.getCurrentPosition(requestOptions));
    if (direct) { lastLocationFailure = 'none'; return direct; }
  } catch (error) {
    lastLocationFailure = locationFailure(error);
  }

  if (!geolocation.watchPosition || !geolocation.clearWatch) return null;
  return new Promise<NativeApproxPosition | null>((resolve) => {
    let settled = false;
    let watchId = '';
    const finish = async (value: NativeApproxPosition | null, failure: NativeLocationFailure = 'none') => {
      if (settled) return;
      settled = true;
      lastLocationFailure = value ? 'none' : failure;
      resolve(value);
      if (watchId) void geolocation.clearWatch({ id: watchId }).catch(() => undefined);
    };
    const timer = window.setTimeout(() => void finish(null, 'timeout'), Math.max(5_000, options.timeoutMs ?? 15_000));
    geolocation.watchPosition(
      { ...requestOptions, interval: 2_500, minimumUpdateInterval: 1_500 },
      (position: any, error: unknown) => {
        const parsed = positionFromResult(position);
        if (parsed) {
          window.clearTimeout(timer);
          void finish(parsed);
        } else if (error) {
          const failure = locationFailure(error);
          if (failure === 'permission-denied' || failure === 'services-disabled') {
            window.clearTimeout(timer);
            void finish(null, failure);
          }
        }
      },
    ).then((id: string) => {
      watchId = String(id || '');
      // Native callbacks can arrive before the promise returns its watch ID.
      if (settled && watchId) void geolocation.clearWatch({ id: watchId }).catch(() => undefined);
    }).catch((error: unknown) => {
      window.clearTimeout(timer);
      void finish(null, locationFailure(error));
    });
  });
}

export async function nativeCameraPermission(): Promise<DevicePermissionState> {
  if (!isNativeDeviceRuntime()) return 'unavailable';
  const camera = plugin('Camera');
  if (!camera) return 'unavailable';
  // Android Camera 8.1+ launches system activities / Photo Picker and needs no
  // manifest CAMERA/storage permission when saveToGallery=false.
  return 'granted';
}

function mediaResultPhoto(result: any, source: NativePhoto['source']): NativePhoto | null {
  if (!result) return null;
  const format = String(result?.metadata?.format || result?.format || 'jpeg').toLowerCase().replace('jpg', 'jpeg');
  const uri = String(result?.uri || result?.path || '').trim() || undefined;
  const webPath = String(result?.webPath || '').trim() || undefined;
  const thumbnail = String(result?.thumbnail || result?.base64String || '').trim() || undefined;
  if (!uri && !webPath && !thumbnail) return null;
  return { uri, webPath, thumbnail, format, source };
}

async function captureWithCamera(source: NativePhoto['source']): Promise<NativePhoto | null> {
  const camera = plugin('Camera');
  if (!camera) throw new Error('NATIVE_CAMERA_PLUGIN_UNAVAILABLE');

  if (source === 'camera' && camera.takePhoto) {
    const result = await camera.takePhoto({
      quality: 86,
      targetWidth: 1600,
      targetHeight: 1600,
      correctOrientation: true,
      saveToGallery: false,
      includeMetadata: true,
    });
    return mediaResultPhoto(result, source);
  }

  if (source === 'photos' && camera.chooseFromGallery) {
    // mediaType is intentionally omitted: Camera 8 defaults to Photo. A numeric
    // magic value here previously made the native contract brittle.
    const result = await camera.chooseFromGallery({
      allowMultipleSelection: false,
      quality: 86,
      targetWidth: 1600,
      targetHeight: 1600,
      includeMetadata: true,
    });
    return mediaResultPhoto(result?.results?.[0], source);
  }

  // Compatibility only for devices/plugins that still expose the pre-8.1 API.
  if (camera.getPhoto) {
    const result = await camera.getPhoto({
      source: source === 'camera' ? 'CAMERA' : 'PHOTOS',
      quality: 86,
      width: 1600,
      height: 1600,
      correctOrientation: true,
      saveToGallery: false,
      resultType: 'uri',
    });
    return mediaResultPhoto(result, source);
  }
  throw new Error('NATIVE_CAMERA_METHOD_UNAVAILABLE');
}

export function takeNativePhoto() {
  return captureWithCamera('camera');
}

export function pickNativePhoto() {
  return captureWithCamera('photos');
}

function base64ToBlob(base64: string, mime: string) {
  const clean = base64.replace(/^data:[^;]+;base64,/, '').replace(/\s+/g, '');
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

function mimeFor(photo: NativePhoto) {
  const format = String(photo.format || 'jpeg').toLowerCase();
  if (format === 'png') return 'image/png';
  if (format === 'webp') return 'image/webp';
  if (format === 'heic' || format === 'heif') return `image/${format}`;
  return 'image/jpeg';
}

async function imageBlobFromFilesystem(photo: NativePhoto): Promise<Blob | null> {
  if (!photo.uri) return null;
  const filesystem = plugin('Filesystem');
  if (!filesystem?.readFile) return null;
  try {
    const result = await filesystem.readFile({ path: photo.uri });
    if (result?.data instanceof Blob) return result.data;
    if (typeof result?.data === 'string' && result.data.trim()) return base64ToBlob(result.data, mimeFor(photo));
  } catch {
    return null;
  }
  return null;
}

async function imageBlobFromUrl(url?: string): Promise<Blob | null> {
  if (!url) return null;
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    return blob.size > 0 ? blob : null;
  } catch {
    return null;
  }
}

export async function nativePhotoToImageFile(photo: NativePhoto, fileName = `tutop-photo-${Date.now()}.jpg`) {
  let blob = await imageBlobFromFilesystem(photo);
  if (!blob && photo.thumbnail) blob = base64ToBlob(photo.thumbnail, mimeFor(photo));
  if (!blob) blob = await imageBlobFromUrl(photo.webPath);
  if (!blob && photo.uri) {
    const converted = runtime()?.convertFileSrc?.(photo.uri);
    blob = await imageBlobFromUrl(converted);
  }
  if (!blob || blob.size <= 0) throw new Error('NATIVE_PHOTO_READ_FAILED');
  const type = blob.type.startsWith('image/') ? blob.type : mimeFor(photo);
  return new File([blob], fileName, { type, lastModified: Date.now() });
}
