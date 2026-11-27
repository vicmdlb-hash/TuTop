/**
 * A trusted reservation/offer deadline must be a real RFC3339 date-time.
 * Date.parse alone normalizes impossible calendar dates (e.g. February 31).
 * Never turn malformed source data into an automatic financial state change.
 */
export function parseStrictIsoTimestamp(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!parts) return null;
  const year = Number(parts[1]), month = Number(parts[2]), day = Number(parts[3]);
  const hour = Number(parts[4]), minute = Number(parts[5]), second = Number(parts[6]);
  if (month < 1 || month > 12 || day < 1 || day > 31
      || hour > 23 || minute > 59 || second > 59) return null;
  const calendar = new Date(0);
  calendar.setUTCFullYear(year, month - 1, day);
  if (calendar.getUTCFullYear() !== year
      || calendar.getUTCMonth() + 1 !== month
      || calendar.getUTCDate() !== day) return null;
  const offset = parts[7];
  if (offset !== 'Z') {
    const [hours, minutes] = offset.slice(1).split(':').map(Number);
    if (hours > 23 || minutes > 59) return null;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

/** An absent expiry preserves explicit legacy offer compatibility.
 * A present malformed expiry never authorizes a fresh commercial action. */
export function assertFreshOfferExpiry(value: unknown, nowMs = Date.now()): void {
  if (value === undefined) return;
  const expiresMs = parseStrictIsoTimestamp(value);
  if (expiresMs === null) throw new Error('OFFER_EXPIRY_INVALID');
  if (expiresMs <= nowMs) throw new Error('OFFER_EXPIRED');
}

export function isRecoverableTransactionRetryError(error: unknown) {
  const candidate = error as any;
  const text = [candidate?.message, candidate?.payload?.error?.message, candidate?.payload?.error?.status]
    .filter(Boolean)
    .join(' ');
  // A retry after a successful reservation may see the lock/offer state already changed
  // and surface FAILED_PRECONDITION or PERMISSION_DENIED instead of ALREADY_EXISTS.
  // These markers only enter an exact deterministic transaction read/compare path.
  return error instanceof TypeError
    || /LISTING_ALREADY_RESERVED|ALREADY_EXISTS|\b409\b|FAILED_PRECONDITION|PERMISSION_DENIED|UNAVAILABLE|DEADLINE_EXCEEDED|timeout|timed out|network|fetch failed|ECONN|ETIMEDOUT/i.test(text);
}

export function transactionMatchesOfferRetry(
  data: Record<string, unknown> | null | undefined,
  expected: {
    listingId: string;
    chatId: string;
    buyerId: string;
    sellerId: string;
    offerId: string;
    amountMxn: number;
  },
) {
  if (!data) return false;
  const amount = Math.round(Number(data.agreed_amount_mxn) * 100) / 100;
  const expectedAmount = Math.round(expected.amountMxn * 100) / 100;
  return data.listing_id === expected.listingId
    && data.chat_id === expected.chatId
    && data.buyer_id === expected.buyerId
    && data.seller_id === expected.sellerId
    && data.accepted_offer_id === expected.offerId
    && amount === expectedAmount
    && ['reserved', 'meetup_scheduled', 'completed'].includes(String(data.status || ''));
}

export const TRANSACTION_RETRY_CONTRACT = {
  deterministic_transaction_id_from_offer: true,
  recover_only_exact_offer_match: true,
  competing_offer_lock_collision_must_not_be_recovered: true,
  firestore_conflict_statuses_only_trigger_exact_recovery: true,
} as const;
