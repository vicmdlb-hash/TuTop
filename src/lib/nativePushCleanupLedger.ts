// Process-independent cleanup intent ledger; stores record IDs, attempt IDs and
// exact Firestore updateTime receipts only. Never store a raw token or auth key.
// An unknown write outcome must remain unknown, never become a cleanup receipt.
export type PushCleanupEntry = { id: string; attempt: string; updateTime: string | null };
type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;
const PREFIX = 'tutop.push.cleanup.v1.';
const LIMIT = 16;
const ATTEMPT = /^[A-Za-z0-9_-]{8,80}$/;

function validOwner(uid: string) {
  return typeof uid === 'string' && /^[A-Za-z0-9:_-]{4,160}$/.test(uid);
}
export function validNativePushRecordId(uid: string, id: unknown): id is string {
  if (!validOwner(uid) || typeof id !== 'string') return false;
  const prefix = uid + '-android-';
  return id.startsWith(prefix) && /^[a-f0-9]{20}$/.test(id.slice(prefix.length));
}
export function validPushCleanupVersion(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(value)) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 19) === value.slice(0, 19);
}
function validEntry(uid: string, entry: unknown): entry is PushCleanupEntry {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false;
  const e = entry as PushCleanupEntry;
  return Object.keys(e).length === 3 && validNativePushRecordId(uid, e.id)
    && typeof e.attempt === 'string' && ATTEMPT.test(e.attempt)
    && (e.updateTime === null || validPushCleanupVersion(e.updateTime));
}
export function createNativePushCleanupLedger(storage: StorageLike, uid: string) {
  if (!validOwner(uid)) throw Error('PUSH_CLEANUP_OWNER_INVALID');
  const key = PREFIX + uid;
  function read(): PushCleanupEntry[] {
    const raw = storage.getItem(key);
    if (raw === null) return [];
    const entries: unknown = JSON.parse(raw);
    if (!Array.isArray(entries) || entries.length > LIMIT || !entries.every(e => validEntry(uid, e))
      || new Set(entries.map(e => e.id)).size !== entries.length)
      throw Error('PUSH_CLEANUP_LEDGER_INVALID');
    return entries;
  }
  function write(entries: PushCleanupEntry[]) {
    storage.setItem(key, JSON.stringify(entries));
    if (JSON.stringify(read()) !== JSON.stringify(entries)) throw Error('PUSH_CLEANUP_LEDGER_READBACK');
  }
  function requireIntent(id: string, attempt: string) {
    if (!validNativePushRecordId(uid, id) || !ATTEMPT.test(attempt)) throw Error('PUSH_CLEANUP_INTENT_INVALID');
    const entries = read();
    const entry = entries.find(e => e.id === id && e.attempt === attempt);
    if (!entry) throw Error('PUSH_CLEANUP_INTENT_STALE');
    return { entries, entry };
  }
  return {
    read,
    begin(id: string, attempt: string) {
      if (!validNativePushRecordId(uid, id) || typeof attempt !== 'string' || !ATTEMPT.test(attempt))
        throw Error('PUSH_CLEANUP_INTENT_INVALID');
      const entries = read();
      const previous = entries.find(e => e.id === id);
      if (previous?.attempt === attempt) throw Error('PUSH_CLEANUP_ATTEMPT_REUSED');
      if (!previous && entries.length >= LIMIT) throw Error('PUSH_CLEANUP_LEDGER_FULL');
      // Invalidate a previous receipt BEFORE a newer write can be attempted.
      write([...entries.filter(e => e.id !== id), { id, attempt, updateTime: null }]);
    },
    confirm(id: string, attempt: string, updateTime: string) {
      const { entries, entry } = requireIntent(id, attempt);
      if (!validPushCleanupVersion(updateTime)) throw Error('PUSH_CLEANUP_RECEIPT_INVALID');
      if (entry.updateTime !== null && entry.updateTime !== updateTime) throw Error('PUSH_CLEANUP_RECEIPT_CONFLICT');
      write(entries.map(e => e.id === id ? { ...e, updateTime } : e));
    },
    acknowledge(entry: PushCleanupEntry) {
      const found = requireIntent(entry.id, entry.attempt);
      if (!validPushCleanupVersion(entry.updateTime) || found.entry.updateTime !== entry.updateTime)
        throw Error('PUSH_CLEANUP_RECEIPT_STALE');
      write(found.entries.filter(e => e.id !== entry.id));
    },
  };
}
export function planNativePushCleanup(uid: string, entry: PushCleanupEntry) {
  if (!validEntry(uid, entry) || !validPushCleanupVersion(entry.updateTime))
    throw Error('PUSH_CLEANUP_RECEIPT_INVALID');
  return { path: 'device_tokens/' + entry.id, options: { merge: true, updateTime: entry.updateTime } };
}
