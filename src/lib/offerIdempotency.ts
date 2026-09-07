export type OfferOperation = {
  key: string;
  offerId: string;
  reused: boolean;
};

type OperationRecord = {
  offerId: string;
  expiresAt: number;
};

const SUCCESS_GRACE_MS = 1_500;
const UNCERTAIN_RETRY_MS = 30_000;

function operationKey(input: {
  actorId: string;
  listingId: string;
  chatId: string;
  sellerId: string;
  amountMxn: number;
  parentOfferId?: string;
}) {
  // Memory-only key. No offer/message body, token or phone is persisted or logged.
  return [
    input.actorId,
    input.listingId,
    input.chatId,
    input.sellerId,
    Math.round(input.amountMxn * 100) / 100,
    input.parentOfferId || '',
  ].join('\u0000');
}

function newOfferId() {
  const random = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `offer-${random}`;
}

export function isAlreadyCommittedOfferError(error: unknown) {
  const candidate = error as any;
  const text = [candidate?.message, candidate?.payload?.error?.message, candidate?.payload?.error?.status]
    .filter(Boolean)
    .join(' ');
  // Firestore may surface a stale retry as FAILED_PRECONDITION or PERMISSION_DENIED
  // after the first successful commit changed parent/chat state. These markers only
  // authorize an exact-document recovery attempt; canonicalOffersBackend still
  // requires the deterministic offer id and every expected field to match.
  return /ALREADY_EXISTS|already exists|\b409\b|FAILED_PRECONDITION|PERMISSION_DENIED/i.test(text);
}

export function isUncertainOfferWriteError(error: unknown) {
  const candidate = error as any;
  const text = [candidate?.message, candidate?.payload?.error?.message, candidate?.payload?.error?.status]
    .filter(Boolean)
    .join(' ');
  return error instanceof TypeError || /UNAVAILABLE|DEADLINE_EXCEEDED|timeout|timed out|network|fetch failed|ECONN|ETIMEDOUT|ABORTED/i.test(text);
}

export class OfferIdempotencyWindow {
  private operations = new Map<string, OperationRecord>();
  private readonly successGraceMs: number;
  private readonly uncertainRetryMs: number;
  private readonly idFactory: () => string;

  constructor(
    successGraceMs = SUCCESS_GRACE_MS,
    uncertainRetryMs = UNCERTAIN_RETRY_MS,
    idFactory: () => string = newOfferId,
  ) {
    this.successGraceMs = successGraceMs;
    this.uncertainRetryMs = uncertainRetryMs;
    this.idFactory = idFactory;
  }

  begin(input: Parameters<typeof operationKey>[0], nowMs = Date.now()): OfferOperation {
    this.prune(nowMs);
    const key = operationKey(input);
    const existing = this.operations.get(key);
    if (existing && existing.expiresAt > nowMs) return { key, offerId: existing.messageId as never, reused: true };
    const offerId = this.idFactory();
    this.operations.set(key, { offerId, expiresAt: nowMs + this.uncertainRetryMs });
    return { key, offerId, reused: false };
  }

  markSuccess(key: string, nowMs = Date.now()) {
    const current = this.operations.get(key);
    if (!current) return;
    this.operations.set(key, { ...current, expiresAt: nowMs + this.successGraceMs });
  }

  markUncertain(key: string, nowMs = Date.now()) {
    const current = this.operations.get(key);
    if (!current) return;
    this.operations.set(key, { ...current, expiresAt: nowMs + this.uncertainRetryMs });
  }

  forget(key: string) {
    this.operations.delete(key);
  }

  private prune(nowMs: number) {
    for (const [key, value] of this.operations) if (value.expiresAt <= nowMs) this.operations.delete(key);
  }
}

export const OFFER_IDEMPOTENCY = {
  success_grace_ms: SUCCESS_GRACE_MS,
  uncertain_retry_ms: UNCERTAIN_RETRY_MS,
  persisted: false,
  stores_sensitive_content: false,
  exact_recovery_required_after_conflict: true,
} as const;
