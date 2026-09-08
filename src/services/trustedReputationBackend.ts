import { FirebaseRestClient } from './firebaseRest';
import { getFirebaseConfig } from './runtimeConfig';

export type TrustedReputationSnapshot = {
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
  updated_at?: string;
};

const TRUSTED_REPUTATION_CACHE_TTL_MS = 5 * 60_000;
const cache = new Map<string, { value: TrustedReputationSnapshot | null; expiresAt: number }>();
const inflight = new Map<string, Promise<TrustedReputationSnapshot | null>>();

function client() {
  const firebase = new FirebaseRestClient(getFirebaseConfig());
  if (!firebase.currentSession?.uid) throw new Error('AUTH_REQUIRED');
  return firebase;
}

function numberOrZero(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export const trustedReputationBackend = {
  async load(uid: string, force = false): Promise<TrustedReputationSnapshot | null> {
    const cleanUid = uid.trim();
    if (!cleanUid) throw new Error('UID_REQUIRED');
    const cached = cache.get(cleanUid);
    if (!force && cached && cached.expiresAt > Date.now()) return cached.value ? { ...cached.value } : null;
    const pending = inflight.get(cleanUid);
    if (!force && pending) return pending;

    const request = client().getDocument<any>(`reputation/${cleanUid}`)
      .then((doc) => {
        if (!doc) return null;
        const data = doc.data || {};
        const value: TrustedReputationSnapshot = {
          subject_uid: String(data.subject_uid || cleanUid),
          completed_transactions: numberOrZero(data.completed_transactions),
          completed_as_seller: numberOrZero(data.completed_as_seller),
          completed_as_buyer: numberOrZero(data.completed_as_buyer),
          seller_review_count: numberOrZero(data.seller_review_count),
          seller_positive_count: numberOrZero(data.seller_positive_count),
          seller_positive_rate: data.seller_positive_rate == null ? null : numberOrZero(data.seller_positive_rate),
          buyer_review_count: numberOrZero(data.buyer_review_count),
          buyer_positive_count: numberOrZero(data.buyer_positive_count),
          buyer_positive_rate: data.buyer_positive_rate == null ? null : numberOrZero(data.buyer_positive_rate),
          cancellations: numberOrZero(data.cancellations),
          no_shows: numberOrZero(data.no_shows),
          reports_upheld: numberOrZero(data.reports_upheld),
          updated_at: data.updated_at ? String(data.updated_at) : undefined,
        };
        if (value.subject_uid !== cleanUid) throw new Error('REPUTATION_SUBJECT_MISMATCH');
        return value;
      })
      .then((value) => {
        cache.set(cleanUid, { value, expiresAt: Date.now() + TRUSTED_REPUTATION_CACHE_TTL_MS });
        return value ? { ...value } : null;
      })
      .finally(() => inflight.delete(cleanUid));

    inflight.set(cleanUid, request);
    return request;
  },
};
