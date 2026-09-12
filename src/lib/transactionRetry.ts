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
