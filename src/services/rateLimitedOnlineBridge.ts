import type { Chat } from '../types';
import { ChatMessageIdempotencyWindow } from '../lib/chatMessageIdempotency';
import { FirebaseRestClient } from './firebaseRest';
import { nationalSchemaEnabled } from './nationalBackend';
import { onlineBackend } from './onlineBackend';
import { commitWithRateLimit } from './rateLimit';
import { getFirebaseConfig } from './runtimeConfig';

function id(prefix: string) {
  const random = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${random}`;
}

const messageIdempotency = new ChatMessageIdempotencyWindow();
const inflightMessageOps = new Map<string, Promise<void>>();

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isAlreadyCommitted(error: unknown) {
  return /ALREADY_EXISTS|already exists|409/i.test(messageOf(error));
}

function client() {
  const firebase = new FirebaseRestClient(getFirebaseConfig());
  if (!firebase.currentSession?.uid) throw new Error('AUTH_REQUIRED');
  return firebase;
}

function patchWrite(firebase: FirebaseRestClient, path: string, data: Record<string, unknown>) {
  return {
    update: firebase.encodeDocumentForWrite(path, data),
    updateMask: { fieldPaths: Object.keys(data) },
  };
}

async function institutionForTarget(firebase: FirebaseRestClient, targetType: 'product' | 'user' | 'chat', targetId: string) {
  if (targetType === 'product') {
    const listing = await firebase.getDocument<any>(`listings_v2/${targetId}`);
    return listing?.data?.institution_id ? String(listing.data.institution_id) : undefined;
  }
  if (targetType === 'user') {
    const user = await firebase.getDocument<any>(`users/${targetId}`);
    return user?.data?.institution_id ? String(user.data.institution_id) : undefined;
  }
  const chat = await firebase.getDocument<any>(`chats/${targetId}`);
  const listingId = String(chat?.data?.product_id || chat?.data?.producto_id || '');
  if (!listingId) return undefined;
  const listing = await firebase.getDocument<any>(`listings_v2/${listingId}`);
  return listing?.data?.institution_id ? String(listing.data.institution_id) : undefined;
}

if (nationalSchemaEnabled()) {
  Object.assign(onlineBackend, {
    async createChat(chat: Chat) {
      const firebase = client();
      const existing = await firebase.getDocument(`chats/${chat.id}`);
      if (existing) return;
      const at = new Date();
      await commitWithRateLimit(firebase, 'chat_create', [
        {
          update: firebase.encodeDocumentForWrite(`chats/${chat.id}`, {
            product_id: chat.producto_id,
            producto_id: chat.producto_id,
            buyer_id: chat.comprador_id,
            comprador_id: chat.comprador_id,
            seller_id: chat.vendedor_id,
            vendedor_id: chat.vendedor_id,
            participants: [chat.comprador_id, chat.vendedor_id],
            nombre_otro_usuario: chat.nombre_otro_usuario,
            created_at: at,
            updated_at: at,
            last_message: '',
            last_message_at: at,
          }),
          currentDocument: { exists: false },
        },
      ], at);
    },

    async sendMessage(chatId: string, text: string, imageUrl?: string) {
      const firebase = client();
      const uid = firebase.currentSession!.uid;
      const clean = text.trim().slice(0, 1500);
      if (!clean && !imageUrl) throw new Error('EMPTY_MESSAGE');
      if (imageUrl && (!imageUrl.startsWith('data:image/') || imageUrl.length > 130000)) throw new Error('Imagen de chat inválida.');

      const operation = messageIdempotency.begin({ uid, chatId, text: clean, imageUrl });
      const active = inflightMessageOps.get(operation.key);
      if (active) return active;

      const at = new Date();
      const messageData: Record<string, unknown> = { sender_id: uid, text: clean, created_at: at };
      if (imageUrl) messageData.image_url = imageUrl;
      const lastMessage = clean || '📷 Foto';

      let task: Promise<void>;
      task = commitWithRateLimit(firebase, 'message_create', [
        { update: firebase.encodeDocumentForWrite(`chats/${chatId}/messages/${operation.messageId}`, messageData), currentDocument: { exists: false } },
        patchWrite(firebase, `chats/${chatId}`, { updated_at: at, last_message: lastMessage.slice(0, 180), last_message_at: at }),
        patchWrite(firebase, `chats/${chatId}/reads/${uid}`, { user_id: uid, read_at: at }),
      ], at).then(() => {
        messageIdempotency.markSuccess(operation.key);
      }).catch((error) => {
        if (isAlreadyCommitted(error)) {
          messageIdempotency.markSuccess(operation.key);
          return;
        }
        messageIdempotency.markUncertain(operation.key);
        throw error;
      }).finally(() => {
        if (inflightMessageOps.get(operation.key) === task) inflightMessageOps.delete(operation.key);
      });
      inflightMessageOps.set(operation.key, task);
      return task;
    },

    async submitReport(targetType: 'product' | 'user' | 'chat', targetId: string, reason: string) {
      const firebase = client();
      const uid = firebase.currentSession!.uid;
      const reportId = id('report');
      const at = new Date();
      const institutionId = await institutionForTarget(firebase, targetType, targetId);
      const payload: Record<string, unknown> = {
        created_by: uid,
        target_type: targetType,
        target_id: targetId,
        reason: reason.trim().slice(0, 500),
        status: 'open',
        priority: 'normal',
        created_at: at,
        updated_at: at,
      };
      if (institutionId) payload.institution_id = institutionId;
      await commitWithRateLimit(firebase, 'report_create', [
        { update: firebase.encodeDocumentForWrite(`reports/${reportId}`, payload), currentDocument: { exists: false } },
      ], at);
      return reportId;
    },
  });
}
