export type OfflineActionType = 'favorite_add' | 'favorite_remove' | 'listing_draft_save' | 'saved_search_save';

export type OfflineAction = {
  id: string;
  type: OfflineActionType;
  entity_id: string;
  payload: Record<string, unknown>;
  attempts: number;
  created_at: string;
  next_attempt_at: string;
};

const MAX_QUEUE_ITEMS = 100;
const MAX_PAYLOAD_BYTES = 24_000;
const MAX_ATTEMPTS = 8;
const FORBIDDEN_KEYS = [
  'phone', 'telefono', 'email', 'institutional_email', 'credential', 'image_data',
  'exact_address', 'address', 'token', 'id_token', 'refresh_token', 'message', 'chat',
  'otp', 'password', 'security_code',
];

function payloadBytes(payload: Record<string, unknown>) {
  return new TextEncoder().encode(JSON.stringify(payload)).byteLength;
}

function containsForbiddenKey(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some(containsForbiddenKey);
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_KEYS.includes(key.toLowerCase())) return true;
    if (containsForbiddenKey(child)) return true;
  }
  return false;
}

export function assertOfflinePayloadSafe(payload: Record<string, unknown>) {
  if (containsForbiddenKey(payload)) throw new Error('OFFLINE_QUEUE_SENSITIVE_DATA');
  if (payloadBytes(payload) > MAX_PAYLOAD_BYTES) throw new Error('OFFLINE_QUEUE_PAYLOAD_TOO_LARGE');
  return true;
}

export function offlineActionKey(action: Pick<OfflineAction, 'type' | 'entity_id'>) {
  return `${action.type}:${action.entity_id}`;
}

function sameLogicalMutation(a: Pick<OfflineAction, 'type' | 'entity_id'>, b: Pick<OfflineAction, 'type' | 'entity_id'>) {
  if (a.entity_id !== b.entity_id) return false;
  const favoriteTypes: OfflineActionType[] = ['favorite_add', 'favorite_remove'];
  if (favoriteTypes.includes(a.type) && favoriteTypes.includes(b.type)) return true;
  return offlineActionKey(a) === offlineActionKey(b);
}

export function retryDelayMs(attempts: number) {
  const safeAttempts = Math.max(0, Math.min(MAX_ATTEMPTS, attempts));
  return Math.min(5 * 60_000, 2_000 * 2 ** safeAttempts);
}

export function enqueueOfflineAction(queue: OfflineAction[], input: Omit<OfflineAction, 'attempts' | 'created_at' | 'next_attempt_at'>, now = new Date()): OfflineAction[] {
  assertOfflinePayloadSafe(input.payload);
  // Keep only the latest logical intent. In particular, add/remove favorite are
  // mutually exclusive and must never replay stale intermediate states on reconnect.
  const withoutSuperseded = queue.filter((item) => !sameLogicalMutation(item, input));
  const action: OfflineAction = {
    ...input,
    attempts: 0,
    created_at: now.toISOString(),
    next_attempt_at: now.toISOString(),
  };
  return [...withoutSuperseded, action].slice(-MAX_QUEUE_ITEMS);
}

export function markOfflineActionFailed(action: OfflineAction, now = new Date()): OfflineAction {
  const attempts = action.attempts + 1;
  return {
    ...action,
    attempts,
    next_attempt_at: new Date(now.getTime() + retryDelayMs(attempts)).toISOString(),
  };
}

export function dueOfflineActions(queue: OfflineAction[], now = new Date()) {
  const time = now.getTime();
  return queue.filter((item) => Date.parse(item.next_attempt_at) <= time && item.attempts < MAX_ATTEMPTS);
}

export function removeOfflineAction(queue: OfflineAction[], id: string) {
  return queue.filter((item) => item.id !== id);
}

export function summarizeOfflineQueue(queue: OfflineAction[], now = new Date()) {
  const keys = queue.map(offlineActionKey);
  const uniqueKeys = new Set(keys);
  const due = dueOfflineActions(queue, now).length;
  const exhausted = queue.filter((item) => item.attempts >= MAX_ATTEMPTS).length;
  return {
    total: queue.length,
    due,
    delayed: Math.max(0, queue.length - due - exhausted),
    exhausted,
    duplicate_keys: keys.length - uniqueKeys.size,
  };
}

export const OFFLINE_QUEUE_LIMITS = {
  max_items: MAX_QUEUE_ITEMS,
  max_payload_bytes: MAX_PAYLOAD_BYTES,
  max_attempts: MAX_ATTEMPTS,
  sensitive_chat_messages_cached: false,
  credentials_cached: false,
  auth_tokens_cached: false,
} as const;
