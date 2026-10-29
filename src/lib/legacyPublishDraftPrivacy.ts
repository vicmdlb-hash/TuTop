import type { ProductFormData } from '../types';
import { adaptiveFieldsFor } from './listingDetails';

export const LEGACY_PUBLISH_DRAFT_UNSCOPED_KEY = 'tutop.publish.draft.v4';
export const LEGACY_PUBLISH_DRAFT_PREFIX = 'tutop.publish.draft.v5.uid.';
export const LEGACY_PUBLISH_DRAFT_TTL_MS = 7 * 24 * 60 * 60_000;

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
type LegacyDraftSnapshot = { draft: Partial<ProductFormData>; adaptive: Record<string, string> };

const STORED_FIELDS = new Set([
  'titulo', 'precio_mxn', 'categoria', 'punto_encuentro', 'descripcion', 'condicion',
  'precio_negociable', 'stock', 'marca', 'modelo', 'talla', 'color', 'facultad',
  'visibility_scope', 'shipping_available', 'horario_entrega', 'disponibilidad',
  'metodos_entrega',
]);
const DELIVERY_METHODS = new Set([
  'Nos encontramos', 'Recoge conmigo', 'Yo entrego', 'Acordamos por chat',
  'Envío local', 'Punto TuTop',
]);

function key(uid: string) {
  return /^[A-Za-z0-9:_-]{4,160}$/.test(uid) ? LEGACY_PUBLISH_DRAFT_PREFIX + uid : '';
}

function storageOrNull(storage?: StorageLike): StorageLike | null {
  if (storage) return storage;
  try { return typeof localStorage !== 'undefined' ? localStorage : null; }
  catch { return null; }
}

function dropUnscoped(storage: StorageLike) {
  // No account can safely claim a v4 draft. Discard, never silently migrate.
  try { storage.removeItem(LEGACY_PUBLISH_DRAFT_UNSCOPED_KEY); }
  catch { /* best-effort local privacy cleanup */ }
}

export function discardLegacyUnscopedDraft(storage?: StorageLike) {
  const target = storageOrNull(storage);
  if (target) dropUnscoped(target);
}

function sanitizeDraft(input: unknown): Partial<ProductFormData> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const draft: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(input).slice(0, 50)) {
    if (!STORED_FIELDS.has(field)) continue;
    if (field === 'metodos_entrega') {
      if (Array.isArray(value)) draft[field] = [...new Set(value.filter(v =>
        typeof v === 'string' && DELIVERY_METHODS.has(v)))].slice(0, 6);
    } else if (typeof value === 'string') {
      draft[field] = value.replace(/\u0000/g, '').slice(0, field === 'descripcion' ? 650 : 160);
    } else if (typeof value === 'number' && Number.isFinite(value)) {
      draft[field] = value;
    } else if (typeof value === 'boolean') {
      draft[field] = value;
    }
  }
  // Only explicit UI listing fields: no photos, tokens, sessions, email or GPS.
  return draft as Partial<ProductFormData>;
}

function sanitizeAdaptive(input: unknown, category: ProductFormData['categoria']): Record<string, string> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const result: Record<string, string> = {};
  const allowed = new Set(adaptiveFieldsFor(category).map(field => field.key));
  for (const [field, value] of Object.entries(input).slice(0, 12)) {
    if (allowed.has(field) && typeof value === 'string') {
      result[field] = value.replace(/\u0000/g, '').slice(0, 100);
    }
  }
  return result;
}

export function readLegacyPublishDraft(
  uid: string, storage?: StorageLike, now = Date.now(),
): LegacyDraftSnapshot | null {
  const target = storageOrNull(storage);
  if (!target) return null;
  dropUnscoped(target);
  const scopedKey = key(uid);
  if (!scopedKey) return null;
  try {
    const raw = target.getItem(scopedKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.schema_version !== 1 || parsed.owner_uid !== uid
      || !Number.isFinite(parsed.expires_at) || parsed.expires_at <= now
      || parsed.expires_at > now + LEGACY_PUBLISH_DRAFT_TTL_MS) {
      target.removeItem(scopedKey);
      return null;
    }
    const draft = sanitizeDraft(parsed.draft);
    return { draft, adaptive: sanitizeAdaptive(parsed.adaptive, draft.categoria) };
  } catch {
    try { target.removeItem(scopedKey); } catch { /* optional local store */ }
    return null;
  }
}

export function writeLegacyPublishDraft(
  uid: string, draft: Partial<ProductFormData>, adaptive: Record<string, string>,
  storage?: StorageLike, now = Date.now(),
) {
  const target = storageOrNull(storage);
  if (!target) return false;
  dropUnscoped(target);
  const scopedKey = key(uid);
  if (!scopedKey) return false;
  try {
    const record = JSON.stringify({
      schema_version: 1, owner_uid: uid,
      expires_at: now + LEGACY_PUBLISH_DRAFT_TTL_MS,
      draft: sanitizeDraft(draft), adaptive: sanitizeAdaptive(adaptive, draft.categoria),
    });
    if (new TextEncoder().encode(record).length > 24 * 1024) return false;
    target.setItem(scopedKey, record);
    return true;
  } catch { return false; }
}

export function clearLegacyPublishDraft(uid: string, storage?: StorageLike) {
  const target = storageOrNull(storage);
  if (!target) return;
  dropUnscoped(target);
  const scopedKey = key(uid);
  if (scopedKey) {
    try { target.removeItem(scopedKey); } catch { /* optional local store */ }
  }
}
