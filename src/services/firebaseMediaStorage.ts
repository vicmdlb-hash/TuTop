import { getNativeAppCheckToken } from './nativeAppCheckToken';
import { FirebaseRestClient } from './firebaseRest';
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
  const text = await response.text().catch(() => '');
  if (response.status === 402) throw new Error('MEDIA_STORAGE_BILLING_REQUIRED');
  if (response.status === 401) throw new Error('MEDIA_STORAGE_AUTH_FAILED');
  if (response.status === 403) throw new Error('MEDIA_STORAGE_PERMISSION_DENIED');
  throw new Error(`MEDIA_STORAGE_HTTP_${response.status}:${text.slice(0, 240)}`);
}

export const firebaseMediaStorage = {
  enabled: mediaStorageEnabled,

  async uploadListingVideo(file: File, expectedUid?: string): Promise<FirebaseMediaReference> {
    if (!featureFlag()) throw new Error('MEDIA_STORAGE_INFRASTRUCTURE_DISABLED');
    const mime = validateListingVideo(file);
    const bucket = storageBucket();
    const { headers: baseHeaders, uid } = await authHeaders();
    if (expectedUid && expectedUid !== uid) throw new Error('MEDIA_STORAGE_OWNER_MISMATCH');
    const path = `product-videos/${uid}/${randomId()}.${extensionFor(mime)}`;

    // Mirrors the Firebase Web Storage client's non-resumable multipart shape:
    // Firebase auth token + optional App Check + X-Goog-Upload-Protocol.
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
    return { bucket, path, uri: encodeMediaUri(bucket, path) };
  },

  async loadVideoBlobUrl(uri: string) {
    if (!featureFlag()) throw new Error('MEDIA_STORAGE_INFRASTRUCTURE_DISABLED');
    const reference = parseFirebaseMediaUri(uri);
    if (!reference) throw new Error('MEDIA_STORAGE_URI_INVALID');
    const { headers } = await authHeaders();
    const response = await assertOk(await fetch(objectUrl(reference.bucket, reference.path, true), { headers }));
    const blob = await response.blob();
    if (!blob.type.startsWith('video/')) throw new Error('MEDIA_STORAGE_NOT_VIDEO');
    return URL.createObjectURL(blob);
  },

  async delete(uri: string) {
    if (!featureFlag()) return;
    const reference = parseFirebaseMediaUri(uri);
    if (!reference) return;
    const { headers } = await authHeaders();
    const response = await fetch(objectUrl(reference.bucket, reference.path), { method: 'DELETE', headers });
    if (response.status === 404) return;
    await assertOk(response);
  },
};