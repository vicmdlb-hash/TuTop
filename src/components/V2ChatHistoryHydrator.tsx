import { useEffect } from 'react';
import { chatHistoryBackend } from '../services/chatHistoryBackend';
import { nationalSchemaEnabled } from '../services/nationalBackend';
import { useAppStore } from '../store/useAppStore';
import type { ChatMessage } from '../types';

function messageKey(message: ChatMessage) {
  return message.id || `${message.sender_id || message.emisor}:${message.hora}:${message.texto}:${message.image_url || ''}`;
}

function mergeWithOptimistic(server: ChatMessage[], current: ChatMessage[]) {
  const byKey = new Map(server.map((message) => [messageKey(message), message]));
  for (const message of current) {
    if (message.id?.startsWith('msg-local')) byKey.set(messageKey(message), message);
  }
  return [...byKey.values()].sort((a, b) => Date.parse(a.hora) - Date.parse(b.hora));
}

export default function V2ChatHistoryHydrator() {
  const activeChatId = useAppStore((state) => state.activeChatId);
  const buyerId = useAppStore((state) => state.chats.find((chat) => chat.id === state.activeChatId)?.comprador_id || '');

  useEffect(() => {
    if (!nationalSchemaEnabled() || !activeChatId || !buyerId) return;
    let active = true;

    const hydrate = (force = false) => {
      void chatHistoryBackend.load(activeChatId, buyerId, force)
        .then((messages) => {
          if (!active) return;
          useAppStore.setState((state) => ({
            chats: state.chats.map((chat) => chat.id === activeChatId
              ? { ...chat, mensajes: mergeWithOptimistic(messages, chat.mensajes) }
              : chat),
          }));
        })
        .catch((error) => console.warn('[TuTop V2 chat history]', error));
    };

    hydrate(true);
    const visible = () => { if (document.visibilityState === 'visible') hydrate(false); };
    document.addEventListener('visibilitychange', visible);
    return () => {
      active = false;
      document.removeEventListener('visibilitychange', visible);
    };
  }, [activeChatId, buyerId]);

  return null;
}
