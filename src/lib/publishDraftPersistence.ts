import type { ListingDeliveryMethod } from './listingSchemaV2.ts';
import type { ListingVisibilityScope, ProductCategory } from '../types/index.ts';
import { MARKETPLACE_CATEGORIES } from './productAssistant.ts';

export const DURABLE_PUBLISH_DRAFT_PREFIX = 'tutop.publish.durable.v2.';
export const DURABLE_PUBLISH_DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const DURABLE_PUBLISH_DRAFT_MAX_BYTES = 48 * 1024;

export type DurablePublishDraft = {
  operationId?: string;
  assistantText?: string;
  title?: string;
  description?: string;
  price?: string;
  quantity?: string;
  category?: ProductCategory | '';
  condition?: string;
  negotiable?: boolean;
  scope?: ListingVisibilityScope;
  deliveryMethods?: ListingDeliveryMethod[];
  meetingPointId?: string;
  attributes?: Record<string, string | number | boolean>;
};

type DurableEnvelope = {
  schema_version: 2;
  uid: string;
  saved_at: number;
  expires_at: number;
  draft: DurablePublishDraft;
};

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function cleanUid(uid: string) {
  const value = String(uid || '').trim();
  return /^[A-Za-z0-9:_-]{4,160}$/.test(value) ? value : '';
}

function storageOrNull(storage?: StorageLike): StorageLike | null {
  if (storage) return storage;
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; }
}

function key(uid: string) {
  const safe = cleanUid(uid);
  return safe ? `${DURABLE_PUBLISH_DRAFT_PREFIX}${safe}` : '';
}

function cleanText(value: unknown, max: number) {
  return typeof value === 'string' ? value.replace(/\u0000/g, '').slice(0, max) : undefined;
}

function cleanAttributes(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const output: Record<string, string | number | boolean> = {};
  for (const [rawKey, rawValue] of Object.entries(value as Record<string, unknown>).slice(0, 40)) {
    const field = rawKey.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80);
    if (!field) continue;
    if (typeof rawValue === 'boolean') output[field] = rawValue;
    else if (typeof rawValue === 'number' && Number.isFinite(rawValue)) output[field] = rawValue;
    else if (typeof rawValue === 'string') output[field] = rawValue.replace(/\u0000/g, '').slice(0, 300);
  }
  return Object.keys(output).length ? output : undefined;
}

export function sanitizeDurablePublishDraft(input: Record<string, unknown>): DurablePublishDraft {
  const deliveryMethods = Array.isArray(input.deliveryMethods)
    ? input.deliveryMethods.filter((item): item is ListingDeliveryMethod =>
        ['campus_meetup', 'pickup', 'local_delivery', 'shipping'].includes(String(item))).slice(0, 4)
    : undefined;
  const rawCategory = cleanText(input.category, 80);
  const category = rawCategory === '' || MARKETPLACE_CATEGORIES.includes(rawCategory as ProductCategory)
    ? rawCategory as ProductCategory | ''
    : undefined;
  const scope = ['campus', 'institution', 'university-zone', 'city', 'national'].includes(String(input.scope))
    ? input.scope as ListingVisibilityScope
    : undefined;
  const rawOperationId = cleanText(input.operationId, 120)?.trim();
  const operationId = rawOperationId && /^[A-Za-z0-9_-]{16,120}$/.test(rawOperationId) ? rawOperationId : undefined;
  return {
    operationId,
    assistantText: cleanText(input.assistantText, 700),
    title: cleanText(input.title, 120),
    description: cleanText(input.description, 3000),
    price: cleanText(input.price, 40),
    quantity: cleanText(input.quantity, 8),
    category,
    condition: cleanText(input.condition, 80),
    negotiable: typeof input.negotiable === 'boolean' ? input.negotiable : undefined,
    scope,
    deliveryMethods,
    meetingPointId: cleanText(input.meetingPointId, 160),
    attributes: cleanAttributes(input.attributes),
  };
}

export function readDurablePublishDraft(uid: string, storage?: StorageLike, now = Date.now()): DurablePublishDraft | null {
  const safeKey = key(uid);
  const target = storageOrNull(storage);
  if (!safeKey || !target) return null;
  try {
    const raw = target.getItem(safeKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DurableEnvelope;
    if (parsed?.schema_version !== 2 || parsed.uid !== cleanUid(uid) || !Number.isFinite(parsed.expires_at)) {
      target.removeItem(safeKey);
      return null;
    }
    if (parsed.expires_at <= now) {
      target.removeItem(safeKey);
      return null;
    }
    return sanitizeDurablePublishDraft(parsed.draft as Record<string, unknown>);
  } catch {
    try { target.removeItem(safeKey); } catch { /* optional durable store */ }
    return null;
  }
}

export function writeDurablePublishDraft(
  uid: string,
  draft: Record<string, unknown>,
  storage?: StorageLike,
  now = Date.now(),
) {
  const safeUid = cleanUid(uid);
  const safeKey = key(uid);
  const target = storageOrNull(storage);
  if (!safeUid || !safeKey || !target) return false;
  try {
    const envelope: DurableEnvelope = {
      schema_version: 2,
      uid: safeUid,
      saved_at: now,
      expires_at: now + DURABLE_PUBLISH_DRAFT_TTL_MS,
      draft: sanitizeDurablePublishDraft(draft),
    };
    const serialized = JSON.stringify(envelope);
    if (new TextEncoder().encode(serialized).byteLength > DURABLE_PUBLISH_DRAFT_MAX_BYTES) return false;
    target.setItem(safeKey, serialized);
    return true;
  } catch {
    return false;
  }
}

export function clearDurablePublishDraft(uid: string, storage?: StorageLike) {
  const safeKey = key(uid);
  const target = storageOrNull(storage);
  if (!safeKey || !target) return;
  try { target.removeItem(safeKey); } catch { /* optional durable store */ }
}
