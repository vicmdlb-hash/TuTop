import { getNativeAppCheckToken } from './nativeAppCheckToken';
import { FirebaseRestClient } from './firebaseRest';
import { recordDiagnostic } from './localDiagnostics';
import { getFirebaseConfig } from './runtimeConfig';

export const MAX_LISTING_VIDEO_BYTES = 50 * 1024 * 1024;
export const LISTING_VIDEO_MIME_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'] as const;

const MEDIA_SCHEME = 'firebase-storage://';

type ListingVideoMime = typeof LISTING_VIDEO_MIME_TYPES[number];

export type FirebaseMediaReference = {
  bucket: string;
  path: string;
  uri: string;
};

function featureFlag() {
  return String(import.meta.env.VITE_TUTOP_MEDIA_STORAGE_ENABLED || '').trim().toLowerCase() === 'true';
}

function storageBucket() {
  const bucket = String(import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '').trim();
  if (!bucket) throw new Error('MEDIA_STORAGE_BUCKET_MISSING');
  return bucket;
}

function randomId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function extensionFor(mime: ListingVideoMime) {
  if (mime === 'video/webm') return 'webm';
  if (mime === 'video/quicktime') return 'mov';
  return 'mp4';
}

function encodeMediaUri(bucket: string, path: string) {
  return `${MEDIA_SCHEME}${bucket}/${path.split('/').map(encodeURIComponent).join('/')}`;
}

export function parseFirebaseMediaUri(uri: string): FirebaseMediaReference | null {
  if (!uri.startsWith(MEDIA_SCHEME)) return null;
  try {
    const parsed = new URL(uri);
    const bucket = parsed.hostname.trim();
    const path = parsed.pathname.split('/').filter(Boolean).map(decodeURIComponent).join('/');
    if (!bucket || !/^product-videos\/[A-Za-z0-9_-]+\/[A-Za-z0-9._-]+$/.test(path)) return null;
    return { bucket, path, uri: encodeMediaUri(bucket, path) };
  } catch {
    return null;
  }
}

export function mediaStorageEnabled() {
  return featureFlag();
}

export function validateListingVideo(file: File) {
  if (!LISTING_VIDEO_MIME_TYPES.includes(file.type as ListingVideoMime)) {
    throw new Error('El video debe ser MP4, WebM o MOV.');
  }
  if (file.size <= 0) throw new Error('El archivo de video está vacío.');
  if (file.size > MAX_LISTING_VIDEO_BYTES) throw new Error('El video debe pesar menos de 50 MB.');
  return file.type as ListingVideoMime;
}

export function userFacingMediaError(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error || '');
  if (raw === 'MEDIA_STORAGE_INFRASTRUCTURE_DISABLED' || raw === 'MEDIA_STORAGE_BILLING_REQUIRED') {
    return 'Los videos todavía no están disponibles en esta beta. Puedes publicar el anuncio con fotos.';
  }
  if (raw === 'MEDIA_STORAGE_AUTH_FAILED') return 'Tu sesión necesita renovarse antes de subir el video. Vuelve a iniciar sesión e inténtalo otra vez.';
  if (raw === 'MEDIA_STORAGE_PERMISSION_DENIED') return 'No pudimos guardar el video con esta cuenta. Inténtalo otra vez después de revisar tu sesión.';
  if (raw === 'MEDIA_STORAGE_OWNER_MISMATCH') return 'No pudimos asociar el video con tu cuenta. Vuelve a iniciar sesión.';
  if (raw === 'MEDIA_STORAGE_URI_INVALID' || raw === 'MEDIA_STORAGE_NOT_VIDEO') return 'Este video no se puede abrir. Prueba con otro archivo.';
  return 'No pudimos procesar el video en este momento. Inténtalo de nuevo.';
}

async function authHeaders(contentType?: string) {
  const config = getFirebaseConfig();
  const client = new FirebaseRestClient(config);
  const session = client.currentSession;
  if (!session?.uid) throw new Error('AUTH_REQUIRED');
  const idToken = await client.getIdToken();
  const headers: Record<string, string> = {
    Authorization: `Firebase ${idToken}`,
    'X-Firebase-Storage-Version': 'tutop/0.9.2',
  };
  if (config.appId) headers['X-Firebase-GMPID'] = config.appId;
  const appCheck = await getNativeAppCheckToken(false).catch(() => null);
  if (appCheck) headers['X-Firebase-AppCheck'] = appCheck;
  if (contentType) headers['Content-Type'] = contentType;
  return { headers, uid: session.uid };
}

function objectUrl(bucket: string, path: string, media = false) {
  const base = `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(path)}`;
  return media ? `${base}?alt=media` : base;
}

async function assertOk(response: Response) {
  if (response.ok) return response;
  const statusClass = Math.floor(response.status / 100) * 100;
  recordDiagnostic('media', 'storage_http_error', { status_class: statusClass });
  if (response.status === 402) throw new Error('MEDIA_STORAGE_BILLING_REQUIRED');
  if (response.status === 401) throw new Error('MEDIA_STORAGE_AUTH_FAILED');
  if (response.status === 403) throw new Error('MEDIA_STORAGE_PERMISSION_DENIED');
  throw new Error(`MEDIA_STORAGE_HTTP_${response.status}`);
}

export const firebaseMediaStorage = {
  enabled: mediaStorageEnabled,

  async uploadListingVideo(file: File, expectedUid?: string): Promise<FirebaseMediaReference> {
    if (!featureFlag()) {
      recordDiagnostic('media', 'video_infrastructure_disabled');
      throw new Error('MEDIA_STORAGE_INFRASTRUCTURE_DISABLED');
    }
    const mime = validateListingVideo(file);
    const bucket = storageBucket();
    const { headers: baseHeaders, uid } = await authHeaders();
    if (expectedUid && expectedUid !== uid) {
      recordDiagnostic('media', 'video_owner_mismatch');
      throw new Error('MEDIA_STORAGE_OWNER_MISMATCH');
    }
    const path = `product-videos/${uid}/${randomId()}.${extensionFor(mime)}`;

    const boundary = `tutop-${randomId().replace(/[^A-Za-z0-9]/g, '')}`;
    const metadata = JSON.stringify({ name: path, contentType: mime });
    const body = new Blob([
      `--${boundary}\r\nContent-Type: application/json; charset=utf-8\r\n\r\n${metadata}\r\n`,
      `--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`,
      file,
      `\r\n--${boundary}--`,
    ]);
    const headers = {
      ...baseHeaders,
      'X-Goog-Upload-Protocol': 'multipart',
      'Content-Type': `multipart/related; boundary=${boundary}`,
    };
    const response = await fetch(`https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucket)}/o?name=${encodeURIComponent(path)}`, {
      method: 'POST',
      headers,
      body,
    });
    await assertOk(response);
    recordDiagnostic('media', 'video_upload_success', { mime: mime.replace('video/', '') });
    return { bucket, path, uri: encodeMediaUri(bucket, path) };
  },

  async loadVideoBlobUrl(uri: string) {
    try {
      if (!featureFlag()) throw new Error('MEDIA_STORAGE_INFRASTRUCTURE_DISABLED');
      const reference = parseFirebaseMediaUri(uri);
      if (!reference) throw new Error('MEDIA_STORAGE_URI_INVALID');
      const { headers } = await authHeaders();
      const response = await assertOk(await fetch(objectUrl(reference.bucket, reference.path, true), { headers }));
      const blob = await response.blob();
      if (!blob.type.startsWith('video/')) throw new Error('MEDIA_STORAGE_NOT_VIDEO');
      recordDiagnostic('media', 'video_load_success');
      return URL.createObjectURL(blob);
    } catch (error) {
      const raw = error instanceof Error ? error.message : 'MEDIA_STORAGE_UNKNOWN';
      recordDiagnostic('media', raw.replace(/[^A-Za-z0-9_.:-]/g, '_').slice(0, 80));
      throw new Error(userFacingMediaError(error));
    }
  },

  async delete(uri: string) {
    if (!featureFlag()) return;
    const reference = parseFirebaseMediaUri(uri);
    if (!reference) return;
    const { headers } = await authHeaders();
    const response = await fetch(objectUrl(reference.bucket, reference.path), { method: 'DELETE', headers });
    if (response.status === 404) return;
    await assertOk(response);
    recordDiagnostic('media', 'video_delete_success');
  },
};