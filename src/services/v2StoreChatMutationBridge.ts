import { feedbackMessage } from '../lib/feedback';
import { onlineBackend } from './onlineBackend';
import { nationalSchemaEnabled } from './nationalBackend';
import { chatHistoryBackend } from './chatHistoryBackend';
import { useAppStore } from '../store/useAppStore';

function localId(prefix: string) {
  const random = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${random}`;
}

function syncError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

if (nationalSchemaEnabled()) {
  useAppStore.setState({
    sendMessage: (chatId: string, text: string) => {
      const clean = text.trim();
      if (!clean) return;
      const state = useAppStore.getState();
      const chat = state.chats.find((item) => item.id === chatId);
      if (!chat) return;
      const emisor = chat.comprador_id === state.user.id ? 'comprador' : 'vendedor';
      const message = {
        id: localId('msg-local'), sender_id: state.user.id, emisor,
        texto: clean.slice(0, 1500), hora: new Date().toISOString(), leido: true,
      } as const;
      useAppStore.setState((current) => ({
        chats: current.chats.map((item) => item.id === chatId ? { ...item, mensajes: [...item.mensajes, message], sin_leer: 0 } : item),
        syncError: null,
      }));
      void onlineBackend.sendMessage(chatId, clean).then(() => {
        chatHistoryBackend.invalidate(chatId);
        useAppStore.setState({ syncError: null });
      }).catch((error) => {
        useAppStore.setState((current) => ({
          chats: current.chats.map((item) => item.id === chatId
            ? { ...item, mensajes: item.mensajes.filter((candidate) => candidate.id !== message.id) }
            : item),
          syncError: syncError(error),
        }));
      });
    },

    sendImageMessage: (chatId: string, imageUrl: string) => {
      const state = useAppStore.getState();
      const chat = state.chats.find((item) => item.id === chatId);
      if (!chat || !imageUrl.startsWith('data:image/')) return;
      const emisor = chat.comprador_id === state.user.id ? 'comprador' : 'vendedor';
      const message = {
        id: localId('msg-local'), sender_id: state.user.id, emisor,
        texto: '', image_url: imageUrl, hora: new Date().toISOString(), leido: true,
      } as const;
      useAppStore.setState((current) => ({
        chats: current.chats.map((item) => item.id === chatId ? { ...item, mensajes: [...item.mensajes, message], sin_leer: 0 } : item),
        syncError: null,
      }));
      feedbackMessage();
      void onlineBackend.sendMessage(chatId, '', imageUrl).then(() => {
        chatHistoryBackend.invalidate(chatId);
        useAppStore.setState({ syncError: null });
      }).catch((error) => {
        useAppStore.setState((current) => ({
          chats: current.chats.map((item) => item.id === chatId
            ? { ...item, mensajes: item.mensajes.filter((candidate) => candidate.id !== message.id) }
            : item),
          syncError: syncError(error),
        }));
      });
    },
  });
}
