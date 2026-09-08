import type { Review } from '../types';
import { FirebaseRestClient } from './firebaseRest';
import { getFirebaseConfig } from './runtimeConfig';

const REVIEW_STATUS_CACHE_TTL_MS = 30_000;
const cache = new Map<string, { value: Review | null; expiresAt: number }>();
const inflight = new Map<string, Promise<Review | null>>();

function client() {
  const firebase = new FirebaseRestClient(getFirebaseConfig());
  if (!firebase.currentSession?.uid) throw new Error('AUTH_REQUIRED');
  return firebase;
}

function key(chatId: string, uid: string) {
  return `${chatId}_${uid}`;
}

export const reviewStatusBackend = {
  async load(chatId: string, force = false): Promise<Review | null> {
    const cleanChatId = chatId.trim();
    if (!cleanChatId) throw new Error('CHAT_ID_REQUIRED');
    const firebase = client();
    const uid = firebase.currentSession!.uid;
    const reviewId = key(cleanChatId, uid);
    const cached = cache.get(reviewId);
    if (!force && cached && cached.expiresAt > Date.now()) return cached.value ? { ...cached.value } : null;
    const pending = inflight.get(reviewId);
    if (!force && pending) return pending;

    const request = firebase.getDocument<any>(`reviews/${reviewId}`)
      .then((doc) => {
        if (!doc) return null;
        const value: Review = {
          id: doc.id,
          chat_id: String(doc.data.chat_id || cleanChatId),
          evaluador_id: String(doc.data.evaluador_id || ''),
          evaluado_id: String(doc.data.evaluado_id || ''),
          calificacion: doc.data.calificacion === 'negative' ? 'negative' : 'positive',
          comentario: doc.data.comentario ? String(doc.data.comentario) : undefined,
          fecha: String(doc.data.fecha || new Date(0).toISOString()),
        };
        if (value.chat_id !== cleanChatId || value.evaluador_id !== uid) throw new Error('REVIEW_STATUS_MISMATCH');
        return value;
      })
      .then((value) => {
        cache.set(reviewId, { value, expiresAt: Date.now() + REVIEW_STATUS_CACHE_TTL_MS });
        return value ? { ...value } : null;
      })
      .finally(() => inflight.delete(reviewId));

    inflight.set(reviewId, request);
    return request;
  },

  remember(review: Review) {
    cache.set(key(review.chat_id, review.evaluador_id), { value: { ...review }, expiresAt: Date.now() + REVIEW_STATUS_CACHE_TTL_MS });
  },

  invalidate(chatId: string, uid: string) {
    const reviewId = key(chatId, uid);
    cache.delete(reviewId);
    inflight.delete(reviewId);
  },
};
