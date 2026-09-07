import type { Chat, ChatMessage } from '../types';
import { FirebaseRestClient, type FirestoreDocument } from './firebaseRest';
import { nationalSchemaEnabled } from './nationalBackend';
import { onlineBackend } from './onlineBackend';
import { getFirebaseConfig } from './runtimeConfig';

const PUBLIC_NAME_TTL_MS = 5 * 60_000;
const nameCache = new Map<string, { name: string; expiresAt: number }>();

function nowIso() { return new Date().toISOString(); }

function getClient() {
  const client = new FirebaseRestClient(getFirebaseConfig());
  if (!client.currentSession?.uid) throw new Error('AUTH_REQUIRED');
  return client;
}

async function publicName(uid: string) {
  if (!uid) return 'Estudiante';
  const cached = nameCache.get(uid);
  if (cached && cached.expiresAt > Date.now()) return cached.name;
  const profile = await getClient().getDocument<any>(`users/${uid}`).catch(() => null);
  const name = String(profile?.data?.nombre || 'Estudiante');
  nameCache.set(uid, { name, expiresAt: Date.now() + PUBLIC_NAME_TTL_MS });
  return name;
}

function summaryMessage(data: any, buyerId: string, viewerUid: string): ChatMessage[] {
  const text = String(data.last_message || '');
  const at = String(data.last_message_at || data.updated_at || data.created_at || nowIso());
  if (!text) return [];
  const senderId = String(data.last_sender_id || '');
  const effectiveSender = senderId || viewerUid;
  return [{
    id: `summary-${at}`,
    sender_id: effectiveSender || undefined,
    emisor: effectiveSender === buyerId ? 'comprador' : 'vendedor',
    texto: text,
    hora: at,
    leido: true,
  }];
}

async function countUnreadSince(chatId: string, uid: string, readAt: number, lastMessageAt: number) {
  if (Number.isFinite(readAt) && Number.isFinite(lastMessageAt) && readAt >= lastMessageAt) return 0;
  const client = getClient();
  const filters = Number.isFinite(readAt) && readAt > 0
    ? [{ field: 'created_at' as const, op: 'GREATER_THAN' as const, value: new Date(readAt).toISOString() }]
    : [];
  const recent = await client.runQuery<any>('messages', filters, [{ field: 'created_at', direction: 'ASCENDING' }], 80, `chats/${chatId}`).catch(() => []);
  return recent.filter((message) => String(message.data.sender_id || '') !== uid).length;
}

async function loadLeanChat(doc: FirestoreDocument<any>, uid: string): Promise<Chat> {
  const client = getClient();
  const data = doc.data || {};
  const buyerId = String(data.comprador_id || data.buyer_id || '');
  const sellerId = String(data.vendedor_id || data.seller_id || '');
  const otherUid = uid === buyerId ? sellerId : buyerId;
  const [confirmations, otherName, readMarker] = await Promise.all([
    client.listDocuments<any>(`chats/${doc.id}/confirmations`, 10).catch(() => []),
    publicName(otherUid),
    client.getDocument<any>(`chats/${doc.id}/reads/${uid}`).catch(() => null),
  ]);
  const readAt = Date.parse(String(readMarker?.data?.read_at || 0));
  const lastMessageAt = Date.parse(String(data.last_message_at || data.updated_at || 0));
  const unreadCount = await countUnreadSince(doc.id, uid, readAt, lastMessageAt);
  const buyerConfirmed = confirmations.some((item) => item.id === buyerId);
  const sellerConfirmed = confirmations.some((item) => item.id === sellerId);
  const completed = buyerConfirmed && sellerConfirmed;

  return {
    id: doc.id,
    producto_id: String(data.producto_id || data.product_id || ''),
    comprador_id: buyerId,
    vendedor_id: sellerId,
    nombre_otro_usuario: otherName || String(data.nombre_otro_usuario || 'Estudiante'),
    mensajes: summaryMessage(data, buyerId, uid),
    entrega_confirmada: completed,
    entrega_estado: completed ? 'completada' : confirmations.length ? 'esperando_confirmacion' : 'negociando',
    confirmaciones_entrega: { comprador: buyerConfirmed, vendedor: sellerConfirmed },
    sin_leer: unreadCount,
  };
}

if (nationalSchemaEnabled()) {
  (onlineBackend as any).loadChat = loadLeanChat;
}
