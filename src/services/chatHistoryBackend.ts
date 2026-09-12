import type { ChatMessage } from '../types';
import { FirebaseRestClient } from './firebaseRest';
import { getFirebaseConfig } from './runtimeConfig';

const CHAT_HISTORY_CACHE_TTL_MS = 20_000;
const CHAT_HISTORY_LIMIT = 100;
const historyCache = new Map<string, { messages: ChatMessage[]; expiresAt: number }>();
const historyInflight = new Map<string, Promise<ChatMessage[]>>();

function getClient() {
  const client = new FirebaseRestClient(getFirebaseConfig());
  if (!client.currentSession?.uid) throw new Error('AUTH_REQUIRED');
  return client;
}

function cacheKey(chatId: string, buyerId: string) {
  return `${chatId}:${buyerId}`;
}

function cloneMessages(messages: ChatMessage[]) {
  return messages.map((message) => ({ ...message }));
}

export const chatHistoryBackend = {
  invalidate(chatId: string) {
    for (const key of [...historyCache.keys()]) if (key.startsWith(`${chatId}:`)) historyCache.delete(key);
    for (const key of [...historyInflight.keys()]) if (key.startsWith(`${chatId}:`)) historyInflight.delete(key);
  },

  async load(chatId: string, buyerId: string, force = false) {
    const cleanChatId = chatId.trim();
    const cleanBuyerId = buyerId.trim();
    if (!cleanChatId) throw new Error('CHAT_ID_REQUIRED');
    if (!cleanBuyerId) throw new Error('BUYER_ID_REQUIRED');
    const key = cacheKey(cleanChatId, cleanBuyerId);
    const cached = historyCache.get(key);
    if (!force && cached && cached.expiresAt > Date.now()) return cloneMessages(cached.messages);
    const inflight = historyInflight.get(key);
    if (!force && inflight) return inflight;

    const client = getClient();
    const request = client.runQuery<any>(
      'messages',
      [],
      [{ field: 'created_at', direction: 'DESCENDING' }],
      CHAT_HISTORY_LIMIT,
      `chats/${cleanChatId}`,
    ).then((docs) => docs
      .map((doc) => {
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
      .sort((a, b) => Date.parse(a.hora) - Date.parse(b.hora)))
      .then((messages) => {
        historyCache.set(key, { messages, expiresAt: Date.now() + CHAT_HISTORY_CACHE_TTL_MS });
        return cloneMessages(messages);
      })
      .finally(() => historyInflight.delete(key));

    historyInflight.set(key, request);
    return request;
  },
};
