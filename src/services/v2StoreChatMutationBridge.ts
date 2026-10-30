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
      const actorUid = state.user.id;
      const chat = state.chats.find((item) => item.id === chatId);
      if (!chat || !actorUid || (chat.comprador_id !== actorUid && chat.vendedor_id !== actorUid)) return;
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
        if (useAppStore.getState().user.id !== actorUid) return;
        chatHistoryBackend.invalidate(chatId);
        useAppStore.setState({ syncError: null });
      }).catch((error) => {
        if (useAppStore.getState().user.id !== actorUid) return;
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
      const actorUid = state.user.id;
      const chat = state.chats.find((item) => item.id === chatId);
      if (!chat || !actorUid || (chat.comprador_id !== actorUid && chat.vendedor_id !== actorUid)
        || !imageUrl.startsWith('data:image/')) return;
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
        if (useAppStore.getState().user.id !== actorUid) return;
        chatHistoryBackend.invalidate(chatId);
        useAppStore.setState({ syncError: null });
      }).catch((error) => {
        if (useAppStore.getState().user.id !== actorUid) return;
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
