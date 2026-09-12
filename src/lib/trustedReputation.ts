import type { MarketplaceTransaction, Review } from '../types';

export type TrustedReputationAggregate = {
  subject_uid: string;
  completed_transactions: number;
  completed_as_seller: number;
  completed_as_buyer: number;
  seller_review_count: number;
  seller_positive_count: number;
  seller_positive_rate: number | null;
  buyer_review_count: number;
  buyer_positive_count: number;
  buyer_positive_rate: number | null;
  cancellations: number;
  no_shows: number;
  reports_upheld: number;
};

type TrustedReview = Pick<Review, 'chat_id' | 'evaluado_id' | 'calificacion'>;
type TrustedTransaction = Pick<MarketplaceTransaction, 'chat_id' | 'buyer_id' | 'seller_id' | 'status' | 'outcome_code' | 'outcome_actor_id'>;

function positiveRate(positive: number, total: number) {
  return total > 0 ? Math.round((positive / total) * 100) : null;
}

function attributedCancellation(transaction: TrustedTransaction, subjectUid: string) {
  if (transaction.status !== 'cancelled') return false;
  if (transaction.outcome_code === 'mutual_cancel') return false;
  if (transaction.outcome_actor_id) return transaction.outcome_actor_id === subjectUid;
  // Compatibility for historical V2 records created before outcome attribution.
  return transaction.buyer_id === subjectUid || transaction.seller_id === subjectUid;
}

function attributedNoShow(transaction: TrustedTransaction, subjectUid: string) {
  if (transaction.status !== 'no_show') return false;
  if (transaction.outcome_actor_id) return transaction.outcome_actor_id === subjectUid;
  return transaction.buyer_id === subjectUid || transaction.seller_id === subjectUid;
}

/**
 * Pure aggregation intended for trusted/admin execution only.
 * Callers must supply transactions/reviews already validated by server-side policy.
 * Reviews count only when they can be tied to a completed transaction for the subject.
 * Cancellations/no-shows are attributed only to the responsible actor when V2 outcome
 * metadata is present; mutual cancellation does not penalize either side.
 */
export function aggregateTrustedReputation(input: {
  subjectUid: string;
  transactions: TrustedTransaction[];
  reviews: TrustedReview[];
  reportsUpheld?: number;
}): TrustedReputationAggregate {
  const { subjectUid } = input;
  const participantTransactions = input.transactions.filter(
    (transaction) => transaction.buyer_id === subjectUid || transaction.seller_id === subjectUid,
  );
  const completed = participantTransactions.filter((transaction) => transaction.status === 'completed');
  const completedByChat = new Map(completed.map((transaction) => [transaction.chat_id, transaction]));

  let sellerReviewCount = 0;
  let sellerPositiveCount = 0;
  let buyerReviewCount = 0;
  let buyerPositiveCount = 0;

  for (const review of input.reviews) {
    if (review.evaluado_id !== subjectUid) continue;
    const transaction = completedByChat.get(review.chat_id);
    if (!transaction) continue;

    if (transaction.seller_id === subjectUid) {
      sellerReviewCount += 1;
      if (review.calificacion === 'positive') sellerPositiveCount += 1;
    } else if (transaction.buyer_id === subjectUid) {
      buyerReviewCount += 1;
      if (review.calificacion === 'positive') buyerPositiveCount += 1;
    }
  }

  return {
    subject_uid: subjectUid,
    completed_transactions: completed.length,
    completed_as_seller: completed.filter((transaction) => transaction.seller_id === subjectUid).length,
    completed_as_buyer: completed.filter((transaction) => transaction.buyer_id === subjectUid).length,
    seller_review_count: sellerReviewCount,
    seller_positive_count: sellerPositiveCount,
    seller_positive_rate: positiveRate(sellerPositiveCount, sellerReviewCount),
    buyer_review_count: buyerReviewCount,
    buyer_positive_count: buyerPositiveCount,
    buyer_positive_rate: positiveRate(buyerPositiveCount, buyerReviewCount),
    cancellations: participantTransactions.filter((transaction) => attributedCancellation(transaction, subjectUid)).length,
    no_shows: participantTransactions.filter((transaction) => attributedNoShow(transaction, subjectUid)).length,
    reports_upheld: Math.max(0, Math.floor(input.reportsUpheld || 0)),
  };
}
