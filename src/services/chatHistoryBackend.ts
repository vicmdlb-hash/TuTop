import { assertFirebaseRequestSessionCurrent, sameFirebaseSession } from '../lib/firebaseSharedSessionGuard';
import type { ChatMessage } from '../types';
import { FirebaseRestClient } from './firebaseRest';
import { getFirebaseConfig } from './runtimeConfig';

const CHAT_HISTORY_CACHE_TTL_MS = 20_000;
const CHAT_HISTORY_LIMIT = 100;
const historyCache = new Map<string, {
  messages: ChatMessage[]; expiresAt: number;
  session: { uid: string; idToken: string; refreshToken: string };
}>();
const historyInflight = new Map<string, { promise: Promise<ChatMessage[]>; session: { uid: string; idToken: string; refreshToken: string } }>();

function getClient() {
  const client = new FirebaseRestClient(getFirebaseConfig());
  if (!client.currentSession?.uid) throw new Error('AUTH_REQUIRED');
  return client;
}

function cacheKey(ownerUid: string, chatId: string, buyerId: string) {
  // The buyer ID is chat metadata, NOT the identity of the person reading it.
  // Percent-encode every component to prevent delimiter collisions across owners.
  return `${encodeURIComponent(ownerUid)}:${encodeURIComponent(chatId)}:${encodeURIComponent(buyerId)}`;
}

function cloneMessages(messages: ChatMessage[]) {
  return messages.map((message) => ({ ...message }));
}

export const chatHistoryBackend = {
  invalidate(chatId: string) {
    const marker = `:${encodeURIComponent(chatId.trim())}:`;
    // Successful sends invalidate this chat for every owner without affecting
    // a different chat whose ID shares a prefix or contains punctuation.
    for (const key of [...historyCache.keys()]) if (key.includes(marker)) historyCache.delete(key);
    for (const key of [...historyInflight.keys()]) if (key.includes(marker)) historyInflight.delete(key);
  },

  async load(chatId: string, buyerId: string, force = false) {
    const cleanChatId = chatId.trim();
    const cleanBuyerId = buyerId.trim();
    if (!cleanChatId) throw new Error('CHAT_ID_REQUIRED');
    if (!cleanBuyerId) throw new Error('BUYER_ID_REQUIRED');
    // AUTH_REQUIRED must be checked BEFORE any cached private messages.
    const client = getClient();
    const requestSession = client.currentSession;
    const assertCurrent = () => assertFirebaseRequestSessionCurrent(
      requestSession, client.currentSession, new FirebaseRestClient(getFirebaseConfig()).currentSession,
    );
    const key = cacheKey(requestSession!.uid, cleanChatId, cleanBuyerId);
    const cached = historyCache.get(key);
    // A new auth epoch (even the SAME UID) must never inherit old private data.
    if (!force && cached && cached.expiresAt > Date.now()
      && sameFirebaseSession(cached.session, requestSession)) {
      assertCurrent();
      return cloneMessages(cached.messages);
    }
    const inflight = historyInflight.get(key);
    // A relogin as the same UID starts a new auth epoch. Never reuse an old
    // session's pending result (or its eventual AUTH_SESSION_CHANGED rejection).
    if (!force && inflight && sameFirebaseSession(inflight.session, requestSession)) {
      assertCurrent();
      return inflight.promise;
    }

    const request = client.runQuery<any>(
      'messages',
      [],
      [{ field: 'created_at', direction: 'DESCENDING' }],
      CHAT_HISTORY_LIMIT,
      `chats/${cleanChatId}`,
    ).then((docs) => {
      assertCurrent();
      if (historyInflight.get(key)?.promise !== request) throw new Error('STALE_CHAT_HISTORY_READ');
      return docs.map((doc) => {
        const senderId = String(doc.data.sender_id || '');
        return {
          id: doc.id,
          sender_id: senderId,
          emisor: senderId === cleanBuyerId ? 'comprador' as const : 'vendedor' as const,
          texto: String(doc.data.text || ''),
          image_url: doc.data.image_url ? String(doc.data.image_url) : undefined,
          hora: String(doc.data.created_at || new Date().toISOString()),
          leido: true,
        };
      })
      .sort((a, b) => Date.parse(a.hora) - Date.parse(b.hora));
    })
      .then((messages) => {
        assertCurrent();
        if (historyInflight.get(key)?.promise !== request) throw new Error('STALE_CHAT_HISTORY_READ');
        historyCache.set(key, { messages, expiresAt: Date.now() + CHAT_HISTORY_CACHE_TTL_MS, session: requestSession! });
        return cloneMessages(messages);
      })
      .finally(() => {
        if (historyInflight.get(key)?.promise === request) historyInflight.delete(key);
      });

    historyInflight.set(key, { promise: request, session: requestSession! });
    return request;
  },
};
