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

function cloneMessages(messages: ChatMessage[]) {
  return messages.map((message) => ({ ...message }));
}

export const chatHistoryBackend = {
  invalidate(chatId: string) {
    historyCache.delete(chatId);
    historyInflight.delete(chatId);
  },

  async load(chatId: string, force = false) {
    const cleanChatId = chatId.trim();
    if (!cleanChatId) throw new Error('CHAT_ID_REQUIRED');
    const cached = historyCache.get(cleanChatId);
    if (!force && cached && cached.expiresAt > Date.now()) return cloneMessages(cached.messages);
    const inflight = historyInflight.get(cleanChatId);
    if (!force && inflight) return inflight;

    const client = getClient();
    const request = client.runQuery<any>(
      'messages',
      [],
      [{ field: 'created_at', direction: 'DESCENDING' }],
      CHAT_HISTORY_LIMIT,
      `chats/${cleanChatId}`,
    ).then((docs) => docs
      .map((doc) => ({
        id: doc.id,
        sender_id: String(doc.data.sender_id || ''),
        emisor: 'comprador' as const,
        texto: String(doc.data.text || ''),
        image_url: doc.data.image_url ? String(doc.data.image_url) : undefined,
        hora: String(doc.data.created_at || new Date().toISOString()),
        leido: true,
      }))
      .sort((a, b) => Date.parse(a.hora) - Date.parse(b.hora)))
      .then((messages) => {
        historyCache.set(cleanChatId, { messages, expiresAt: Date.now() + CHAT_HISTORY_CACHE_TTL_MS });
        return cloneMessages(messages);
      })
      .finally(() => historyInflight.delete(cleanChatId));

    historyInflight.set(cleanChatId, request);
    return request;
  },
};
