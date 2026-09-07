import { FirebaseRestClient, type AuthSession, type FirestoreDocument } from './firebaseRest';
import { getFirebaseConfig } from './runtimeConfig';
import { MARKETPLACE_CATEGORIES, VALID_MEETING_POINTS, normalizeCategory, sellerLevelFor } from '../lib/productAssistant';
import type { AppNotification, Chat, Product, Review, User, WalletTransaction } from '../types';

export interface OnlineSnapshot {
  user: User;
  products: Product[];
  chats: Chat[];
  reviews: Review[];
  transactions: WalletTransaction[];
  notifications: AppNotification[];
  favorites: string[];
  isAdmin: boolean;
}

function id(prefix: string) {
  return `${prefix}-${typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
}

function weekId(date = new Date()) {
  const copy = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = copy.getUTCDay() || 7;
  copy.setUTCDate(copy.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(copy.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((copy.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${copy.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function nowIso() { return new Date().toISOString(); }

function asProduct(doc: FirestoreDocument<any>): Product {
  const data = doc.data || {};
  return {
    id: doc.id,
    vendedor_id: String(data.vendedor_id || data.seller_id || ''),
    vendedor_nombre: String(data.vendedor_nombre || data.seller_name || 'Estudiante'),
    vendedor_handle: data.vendedor_handle ? String(data.vendedor_handle) : undefined,
    vendedor_verificado: Boolean(data.vendedor_verificado),
    titulo: String(data.titulo || ''),
    descripcion: data.descripcion ? String(data.descripcion) : undefined,
    precio_mxn: Number(data.precio_mxn || 0),
    stock: Math.max(1, Number(data.stock || 1)),
    categoria: normalizeCategory(String(data.categoria || 'Otros')),
    facultad: String(data.facultad || 'Comunidad universitaria'),
    punto_encuentro: data.punto_encuentro,
    imagen_url: String(data.imagen_url || (Array.isArray(data.imagenes_url) ? data.imagenes_url[0] : '') || ''),
    imagenes_url: Array.isArray(data.imagenes_url) ? data.imagenes_url.map(String).slice(0, 4) : undefined,
    estado: data.estado || 'Activo',
    es_top: false,
    jerarquia_top: 0,
    puja_ucoins: 0,
    likes: Number(data.likes || 0),
    fecha_creacion: String(data.fecha_creacion || data.created_at || nowIso()),
  } as Product;
}

export class TuTopOnlineBackend {
  private client: FirebaseRestClient | null = null;
  private verificationCache = new Map<string, { approved: boolean; expiresAt: number }>();
  private publicNameCache = new Map<string, { name: string; expiresAt: number }>();
  private readonly publicCacheTtlMs = 5 * 60_000;

  configureFromRuntime() {
    const config = getFirebaseConfig();
    this.client = config ? new FirebaseRestClient(config) : null;
    return this.client;
  }

  get ready() { return Boolean(this.client); }
  get session() { return this.client?.currentSession || null; }
  get projectId() { return this.client?.projectId || null; }

  private getClient() {
    if (!this.client) this.configureFromRuntime();
    if (!this.client) throw new Error('FIREBASE_NOT_CONFIGURED');
    return this.client;
  }

  async register(phone: string, password: string, profile: { nombre: string; facultad: string }) {
    const client = this.getClient();
    let session: AuthSession;
    let createdAuthIdentity = true;
    try {
      session = await client.registerWithPhonePassword(phone, password);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/EMAIL_EXISTS/i.test(message)) throw error;
      createdAuthIdentity = false;
      session = await client.signInWithPhonePassword(phone, password);
      const existingProfile = await client.getDocument<any>(`users/${session.uid}`);
      if (existingProfile) {
        client.signOut();
        throw error;
      }
    }
    try {
      await this.createInitialAccount(session, profile);
      await this.ensureMarketplaceCatalog();
    } catch (error) {
      if (createdAuthIdentity) {
        try { await client.deleteAuthAccount(); } catch { client.signOut(); }
      } else client.signOut();
      throw error;
    }
    return session;
  }

  async ensureMarketplaceCatalog() {
    const client = this.getClient();
    const session = client.currentSession;
    if (!session) return;
    const existing = await client.getDocument<any>('catalog/marketplace').catch(() => null);
    if (existing) return;
    await client.setDocument('catalog/marketplace', {
      version: 1,
      categories: MARKETPLACE_CATEGORIES,
      meeting_points: VALID_MEETING_POINTS,
      updated_at: nowIso(),
    }, { exists: false }).catch((error: any) => { if (error?.status !== 409) throw error; });
  }

  async login(phone: string, password: string) {
    const session = await this.getClient().signInWithPhonePassword(phone, password);
    const profile = await this.getClient().getDocument(`users/${session.uid}`);
    if (!profile) throw new Error('PROFILE_MISSING');
    await this.ensureMarketplaceCatalog();
    return session;
  }

  signOut() { this.getClient().signOut(); }

  private async createInitialAccount(session: AuthSession, profile: { nombre: string; facultad: string }) {
    const client = this.getClient();
    const createdAt = nowIso();
    const walletTxId = `welcome-${session.uid}`;
    const writes = [
      {
        update: client.encodeDocumentForWrite(`users/${session.uid}`, {
          uid: session.uid,
          nombre: profile.nombre.trim().slice(0, 80),
          facultad: profile.facultad,
          esta_verificado: false,
          created_at: createdAt,
          updated_at: createdAt,
        }),
        currentDocument: { exists: false },
      },
      {
        update: client.encodeDocumentForWrite(`user_private/${session.uid}`, {
          uid: session.uid,
          telefono: session.phone,
          created_at: createdAt,
          auth_mode: 'phone_password_beta',
        }),
        currentDocument: { exists: false },
      },
      {
        update: client.encodeDocumentForWrite(`wallets/${session.uid}`, {
          owner_uid: session.uid,
          balance: 10,
          prestige: 0,
          welcome_granted: true,
          last_op_id: walletTxId,
          updated_at: createdAt,
        }),
        currentDocument: { exists: false },
      },
      {
        update: client.encodeDocumentForWrite(`wallet_transactions/${walletTxId}`, {
          user_id: session.uid,
          type: 'income',
          description: 'Bono de bienvenida',
          amount: 10,
          operation_id: walletTxId,
          created_at: createdAt,
        }),
        currentDocument: { exists: false },
      },
    ];
    await client.commit(writes);
  }

  async loadSnapshot(): Promise<OnlineSnapshot> {
    const client = this.getClient();
    const session = client.currentSession;
    if (!session) throw new Error('AUTH_REQUIRED');
    await client.getIdToken();
    await this.ensureMarketplaceCatalog().catch(() => undefined);

    const [profileDoc, walletDoc, productsDocs, chatsDocs, favoritesDocs, ownReviewDocs, receivedReviewDocs, txDocs, publicVerification, adminDoc, moderationDoc, bidDocs] = await Promise.all([
      client.getDocument<any>(`users/${session.uid}`),
      client.getDocument<any>(`wallets/${session.uid}`),
      client.runQuery<any>('products', [], [{ field: 'fecha_creacion', direction: 'DESCENDING' }], 100),
      client.runQuery<any>('chats', [{ field: 'participants', op: 'ARRAY_CONTAINS', value: session.uid }], [{ field: 'updated_at', direction: 'DESCENDING' }], 60),
      client.runQuery<any>('favorites', [{ field: 'uid', op: 'EQUAL', value: session.uid }], [], 200),
      client.runQuery<any>('reviews', [{ field: 'evaluador_id', op: 'EQUAL', value: session.uid }], [], 100),
      client.runQuery<any>('reviews', [{ field: 'evaluado_id', op: 'EQUAL', value: session.uid }], [], 100),
      client.runQuery<any>('wallet_transactions', [{ field: 'user_id', op: 'EQUAL', value: session.uid }], [{ field: 'created_at', direction: 'DESCENDING' }], 100),
      client.getDocument<any>(`publicVerifications/${session.uid}`),
      client.getDocument<any>(`admins/${session.uid}`),
      client.getDocument<any>(`moderationStatus/${session.uid}`),
      client.runQuery<any>('bids', [{ field: 'week_id', op: 'EQUAL', value: weekId() }], [], 300),
    ]);

    if (!profileDoc) throw new Error('PROFILE_MISSING');
    if (!walletDoc) throw new Error('WALLET_MISSING');

    if (publicVerification) this.verificationCache.set(session.uid, { approved: publicVerification.data?.approved === true, expiresAt: Date.now() + this.publicCacheTtlMs });
    const verified = await this.loadVerifiedSellers(productsDocs.map(asProduct).map((product) => product.vendedor_id));

    let products: Product[] = productsDocs.map(asProduct).map((product) => ({
      ...product,
      vendedor_verificado: verified.has(product.vendedor_id),
    }));
    products = this.applyWeeklyRanking(products, bidDocs);

    const chats = await Promise.all(chatsDocs.map(async (doc) => this.loadChat(doc, session.uid)));
    const receivedNegative = receivedReviewDocs.filter((doc) => doc.data?.calificacion === 'negative');
    const cutoff = Date.now() - 30 * 86400000;
    const strikes = receivedNegative.filter((doc) => Date.parse(String(doc.data?.fecha || doc.data?.created_at || 0)) >= cutoff).length;
    const wallet = walletDoc.data;
    const profile = profileDoc.data;
    const user: User = {
      id: session.uid,
      telefono: session.phone,
      nombre: String(profile.nombre || 'Estudiante'),
      facultad: String(profile.facultad || 'Comunidad universitaria'),
      saldo_ucoins: Number(wallet.balance || 0),
      puntos_prestigio: Number(wallet.prestige || 0),
      nivel_vendedor: sellerLevelFor(Number(wallet.prestige || 0)),
      esta_verificado: publicVerification?.data?.approved === true,
      strikes,
      fecha_registro: String(profile.created_at || nowIso()),
      avatar_url: profile.avatar_url ? String(profile.avatar_url) : undefined,
      is_suspended: moderationDoc?.data?.suspended === true,
      suspension_reason: moderationDoc?.data?.reason ? String(moderationDoc.data.reason) : undefined,
    };

    const reviewDocs = [...ownReviewDocs, ...receivedReviewDocs].filter((doc, index, list) => list.findIndex((item) => item.id === doc.id) === index);
    const reviews: Review[] = reviewDocs.map((doc) => ({
      id: doc.id,
      chat_id: String(doc.data.chat_id || ''),
      evaluador_id: String(doc.data.evaluador_id || ''),
      evaluado_id: String(doc.data.evaluado_id || ''),
      calificacion: doc.data.calificacion,
      comentario: doc.data.comentario ? String(doc.data.comentario) : undefined,
      fecha: String(doc.data.fecha || doc.data.created_at || nowIso()),
    }));

    const transactions: WalletTransaction[] = txDocs.map((doc) => ({
      id: doc.id,
      type: doc.data.type === 'income' ? 'income' : 'expense',
      description: String(doc.data.description || 'Movimiento'),
      amount: Number(doc.data.amount || 0),
      date: String(doc.data.created_at || nowIso()),
      operation_id: doc.data.operation_id ? String(doc.data.operation_id) : undefined,
    }));

    const notifications = this.deriveNotifications(chats, products, bidDocs, session.uid);

    return {
      user,
      products,
      chats,
      reviews,
      transactions,
      notifications,
      favorites: favoritesDocs.map((doc) => String(doc.data.product_id || '')).filter(Boolean),
      isAdmin: adminDoc?.data?.active === true,
    };
  }

  private async loadVerifiedSellers(sellerIds: string[]) {
    const client = this.getClient();
    const now = Date.now();
    const unique = [...new Set(sellerIds.filter(Boolean))];
    const approved = new Set<string>();
    await Promise.all(unique.map(async (uid) => {
      const cached = this.verificationCache.get(uid);
      if (cached && cached.expiresAt > now) {
        if (cached.approved) approved.add(uid);
        return;
      }
      const doc = await client.getDocument<any>(`publicVerifications/${uid}`).catch(() => null);
      const isApproved = doc?.data?.approved === true;
      this.verificationCache.set(uid, { approved: isApproved, expiresAt: now + this.publicCacheTtlMs });
      if (isApproved) approved.add(uid);
    }));
    return approved;
  }

  private async loadPublicName(uid: string) {
    if (!uid) return 'Estudiante';
    const now = Date.now();
    const cached = this.publicNameCache.get(uid);
    if (cached && cached.expiresAt > now) return cached.name;
    const profile = await this.getClient().getDocument<any>(`users/${uid}`).catch(() => null);
    const name = String(profile?.data?.nombre || 'Estudiante');
    this.publicNameCache.set(uid, { name, expiresAt: now + this.publicCacheTtlMs });
    return name;
  }

  private applyWeeklyRanking(products: Product[], bidDocs: FirestoreDocument<any>[]) {
    const bestByProduct = new Map<string, { amount: number; createdAt: number }>();
    for (const bid of bidDocs) {
      const productId = String(bid.data.product_id || '');
      const amount = Number(bid.data.amount || 0);
      const createdAt = Date.parse(String(bid.data.created_at || nowIso()));
      const prior = bestByProduct.get(productId);
      if (!prior || amount > prior.amount || (amount === prior.amount && createdAt < prior.createdAt)) bestByProduct.set(productId, { amount, createdAt });
    }
    const grouped = new Map<string, Product[]>();
    const enriched = products.map((product) => ({ ...product, es_top: false, jerarquia_top: 0 as 0 | 1 | 2 | 3, puja_ucoins: bestByProduct.get(product.id)?.amount || 0 }));
    for (const product of enriched.filter((item) => item.estado === 'Activo' && (item.puja_ucoins || 0) > 0)) {
      const key = product.facultad;
      grouped.set(key, [...(grouped.get(key) || []), product]);
    }
    for (const list of grouped.values()) {
      list.sort((a, b) => (b.puja_ucoins || 0) - (a.puja_ucoins || 0) || (bestByProduct.get(a.id)?.createdAt || 0) - (bestByProduct.get(b.id)?.createdAt || 0));
      list.slice(0, 3).forEach((product, index) => { product.es_top = true; product.jerarquia_top = (index + 1) as 1 | 2 | 3; });
    }
    return enriched;
  }

  private async loadChat(doc: FirestoreDocument<any>, uid: string): Promise<Chat> {
    const client = this.getClient();
    const data = doc.data;
    const buyerId = String(data.comprador_id || data.buyer_id || '');
    const sellerId = String(data.vendedor_id || data.seller_id || '');
    const otherUid = uid === buyerId ? sellerId : buyerId;
    const [messages, confirmations, otherName, readMarker] = await Promise.all([
      client.runQuery<any>('messages', [], [{ field: 'created_at', direction: 'DESCENDING' }], 80, `chats/${doc.id}`).catch(() => []),
      client.listDocuments<any>(`chats/${doc.id}/confirmations`, 10).catch(() => []),
      this.loadPublicName(otherUid),
      client.getDocument<any>(`chats/${doc.id}/reads/${uid}`).catch(() => null),
    ]);
    messages.sort((a, b) => Date.parse(String(a.data.created_at || 0)) - Date.parse(String(b.data.created_at || 0)));
    const readAt = Date.parse(String(readMarker?.data?.read_at || 0));
    const unreadCount = messages.filter((message) => String(message.data.sender_id || '') !== uid && Date.parse(String(message.data.created_at || 0)) > readAt).length;
    const buyerConfirmed = confirmations.some((item) => item.id === buyerId);
    const sellerConfirmed = confirmations.some((item) => item.id === sellerId);
    const completed = buyerConfirmed && sellerConfirmed;
    return {
      id: doc.id,
      producto_id: String(data.producto_id || data.product_id || ''),
      comprador_id: buyerId,
      vendedor_id: sellerId,
      nombre_otro_usuario: String(otherName || data.other_names?.[uid] || data.nombre_otro_usuario || 'Estudiante'),
      mensajes: messages.map((message) => ({
        id: message.id,
        sender_id: String(message.data.sender_id || ''),
        emisor: String(message.data.sender_id || '') === buyerId ? 'comprador' : 'vendedor',
        texto: String(message.data.text || ''),
        image_url: message.data.image_url ? String(message.data.image_url) : undefined,
        hora: String(message.data.created_at || nowIso()),
        leido: true,
      })),
      entrega_confirmada: completed,
      entrega_estado: completed ? 'completada' : confirmations.length ? 'esperando_confirmacion' : 'negociando',
      confirmaciones_entrega: { comprador: buyerConfirmed, vendedor: sellerConfirmed },
      sin_leer: unreadCount,
    };
  }

  private deriveNotifications(chats: Chat[], products: Product[], bids: FirestoreDocument<any>[], uid: string): AppNotification[] {
    const notifications: AppNotification[] = [];
    for (const chat of chats) {
      const last = chat.mensajes.length ? chat.mensajes[chat.mensajes.length - 1] : undefined;
      if (last && last.sender_id !== uid) notifications.push({ id: `msg-${last.id || chat.id}`, kind: 'message', title: `Mensaje de ${chat.nombre_otro_usuario}`, body: last.texto.slice(0, 90), created_at: last.hora, read: (chat.sin_leer || 0) === 0, chat_id: chat.id, product_id: chat.producto_id });
    }
    const ownProductIds = new Set(products.filter((product) => product.vendedor_id === uid).map((product) => product.id));
    for (const bid of bids.filter((item) => ownProductIds.has(String(item.data.product_id || '')))) {
      notifications.push({ id: `bid-${bid.id}`, kind: 'bid', title: 'Puja semanal registrada', body: `${Number(bid.data.amount || 0)} UCoins en tu publicación.`, created_at: String(bid.data.created_at || nowIso()), read: true, product_id: String(bid.data.product_id || '') });
    }
    return notifications.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)).slice(0, 30);
  }

  async updateProfile(updates: { nombre?: string; facultad?: string; avatar_url?: string }) {
    const client = this.getClient();
    const uid = client.currentSession?.uid;
    if (!uid) throw new Error('AUTH_REQUIRED');
    const data: Record<string, unknown> = { updated_at: nowIso() };
    if (updates.nombre !== undefined) data.nombre = updates.nombre.trim().slice(0, 80);
    if (updates.facultad !== undefined) data.facultad = updates.facultad.trim().slice(0, 100);
    if (updates.avatar_url !== undefined) {
      if (updates.avatar_url && !updates.avatar_url.startsWith('data:image/')) throw new Error('Avatar inválido.');
      data.avatar_url = updates.avatar_url.slice(0, 250000);
    }
    await client.setDocument(`users/${uid}`, data, { merge: true });
    this.publicNameCache.delete(uid);
  }

  async createProduct(product: Product) {
    const client = this.getClient();
    const uid = client.currentSession?.uid;
    if (!uid || product.vendedor_id !== uid) throw new Error('No puedes publicar por otra cuenta.');
    await client.setDocument(`products/${product.id}`, {
      vendedor_id: uid,
      vendedor_nombre: product.vendedor_nombre,
      vendedor_handle: product.vendedor_handle || '',
      titulo: product.titulo,
      descripcion: product.descripcion || '',
      precio_mxn: product.precio_mxn,
      stock: product.stock || 1,
      categoria: product.categoria,
      facultad: product.facultad,
      punto_encuentro: product.punto_encuentro,
      imagen_url: product.imagen_url,
      imagenes_url: product.imagenes_url || [product.imagen_url],
      estado: product.estado,
      likes: 0,
      fecha_creacion: product.fecha_creacion,
      updated_at: nowIso(),
    }, { exists: false });
  }

  async updateProduct(productId: string, updates: Partial<Product>) {
    const allowed = ['titulo', 'descripcion', 'precio_mxn', 'stock', 'categoria', 'facultad', 'punto_encuentro', 'imagen_url', 'imagenes_url', 'estado'] as const;
    const data: Record<string, unknown> = {};
    for (const key of allowed) if (updates[key] !== undefined) data[key] = updates[key];
    data.updated_at = nowIso();
    await this.getClient().setDocument(`products/${productId}`, data, { merge: true });
  }

  async createChat(chat: Chat) {
    const client = this.getClient();
    const existing = await client.getDocument(`chats/${chat.id}`);
    if (existing) return;
    await client.setDocument(`chats/${chat.id}`, {
      product_id: chat.producto_id,
      producto_id: chat.producto_id,
      buyer_id: chat.comprador_id,
      comprador_id: chat.comprador_id,
      seller_id: chat.vendedor_id,
      vendedor_id: chat.vendedor_id,
      participants: [chat.comprador_id, chat.vendedor_id],
      nombre_otro_usuario: chat.nombre_otro_usuario,
      created_at: nowIso(),
      updated_at: nowIso(),
      last_message: '',
      last_message_at: nowIso(),
    }, { exists: false });
  }

  async sendMessage(chatId: string, text: string, imageUrl?: string) {
    const client = this.getClient();
    const uid = client.currentSession?.uid;
    if (!uid) throw new Error('AUTH_REQUIRED');
    const clean = text.trim().slice(0, 1500);
    if (!clean && !imageUrl) throw new Error('EMPTY_MESSAGE');
    if (imageUrl && (!imageUrl.startsWith('data:image/') || imageUrl.length > 130000)) throw new Error('Imagen de chat inválida.');
    const messageId = id('msg');
    const createdAt = nowIso();
    const messageData: Record<string, unknown> = { sender_id: uid, text: clean, created_at: createdAt };
    if (imageUrl) messageData.image_url = imageUrl;
    const lastMessage = clean || '📷 Foto';
    await client.commit([
      { update: client.encodeDocumentForWrite(`chats/${chatId}/messages/${messageId}`, messageData), currentDocument: { exists: false } },
      { update: client.encodeDocumentForWrite(`chats/${chatId}`, { updated_at: createdAt, last_message: lastMessage.slice(0, 180), last_message_at: createdAt }), updateMask: { fieldPaths: ['updated_at', 'last_message', 'last_message_at'] } },
    ]);
  }

  async markChatRead(chatId: string) {
    const client = this.getClient();
    const uid = client.currentSession?.uid;
    if (!uid) throw new Error('AUTH_REQUIRED');
    await client.setDocument(`chats/${chatId}/reads/${uid}`, { user_id: uid, read_at: nowIso() }, { merge: true });
  }

  async confirmDelivery(chatId: string) {
    const client = this.getClient();
    const uid = client.currentSession?.uid;
    if (!uid) throw new Error('AUTH_REQUIRED');
    await client.setDocument(`chats/${chatId}/confirmations/${uid}`, { user_id: uid, created_at: nowIso() }, { exists: false });
  }

  async submitReview(chat: Chat, calificacion: Review['calificacion'], comentario?: string) {
    const client = this.getClient();
    const uid = client.currentSession?.uid;
    if (!uid) throw new Error('AUTH_REQUIRED');
    const evaluated = chat.comprador_id === uid ? chat.vendedor_id : chat.comprador_id;
    await client.setDocument(`reviews/${chat.id}_${uid}`, {
      chat_id: chat.id,
      evaluador_id: uid,
      evaluado_id: evaluated,
      calificacion,
      comentario: comentario?.trim().slice(0, 500) || '',
      fecha: nowIso(),
    }, { exists: false });
  }

  async toggleFavorite(productId: string, shouldFavorite: boolean) {
    const client = this.getClient();
    const uid = client.currentSession?.uid;
    if (!uid) throw new Error('AUTH_REQUIRED');
    const favoriteId = `${uid}_${productId}`;
    if (shouldFavorite) await client.setDocument(`favorites/${favoriteId}`, { uid, product_id: productId, created_at: nowIso() }, { exists: false }).catch((error: any) => { if (error?.status !== 409) throw error; });
    else await client.deleteDocument(`favorites/${favoriteId}`).catch((error: any) => { if (error?.status !== 404) throw error; });
  }

  async bidProduct(product: Product, amount: number) {
    const client = this.getClient();
    const uid = client.currentSession?.uid;
    if (!uid) throw new Error('AUTH_REQUIRED');
    if (product.vendedor_id !== uid) throw new Error('Sólo puedes impulsar tus propias publicaciones.');
    if (!Number.isInteger(amount) || amount < 1 || amount > 5000) throw new Error('Puja inválida.');
    const walletDoc = await client.getDocument<any>(`wallets/${uid}`);
    if (!walletDoc?.updateTime) throw new Error('Wallet no disponible.');
    const balance = Number(walletDoc.data.balance || 0);
    const prestige = Number(walletDoc.data.prestige || 0);
    if (balance < amount) throw new Error('No tienes suficientes UCoins.');
    const operationId = id('bid');
    const createdAt = nowIso();
    const bid = {
      uid,
      product_id: product.id,
      facultad: product.facultad,
      categoria: product.categoria,
      amount,
      week_id: weekId(),
      created_at: createdAt,
    };
    await client.commit([
      {
        update: client.encodeDocumentForWrite(`wallets/${uid}`, { balance: balance - amount, prestige: prestige + amount, last_op_id: operationId, updated_at: createdAt }),
        updateMask: { fieldPaths: ['balance', 'prestige', 'last_op_id', 'updated_at'] },
        currentDocument: { updateTime: walletDoc.updateTime },
      },
      { update: client.encodeDocumentForWrite(`bids/${operationId}`, bid), currentDocument: { exists: false } },
      { update: client.encodeDocumentForWrite(`wallet_transactions/${operationId}`, { user_id: uid, type: 'expense', description: `Puja semanal · ${product.titulo}`, amount: -amount, operation_id: operationId, created_at: createdAt }), currentDocument: { exists: false } },
    ]);
    return operationId;
  }

  async isAdmin() {
    const uid = this.getClient().currentSession?.uid;
    if (!uid) return false;
    return (await this.getClient().getDocument<any>(`admins/${uid}`))?.data?.active === true;
  }

  async listAdminCollection(collection: string, limit = 200) {
    if (!await this.isAdmin()) throw new Error('ADMIN_REQUIRED');
    return this.getClient().listDocuments<any>(collection, limit);
  }

  async adminApproveVerification(uid: string, approved: boolean) {
    if (!await this.isAdmin()) throw new Error('ADMIN_REQUIRED');
    const client = this.getClient();
    const at = nowIso();
    await client.commit([
      { update: client.encodeDocumentForWrite(`verificationRequests/${uid}`, { status: approved ? 'approved' : 'rejected', updated_at: at }), updateMask: { fieldPaths: ['status', 'updated_at'] } },
      { update: client.encodeDocumentForWrite(`publicVerifications/${uid}`, { approved, updated_at: at, reviewed_by: client.currentSession?.uid || '' }) },
    ]);
    this.verificationCache.delete(uid);
  }

  async adminSetSuspension(uid: string, suspended: boolean, reason = '') {
    if (!await this.isAdmin()) throw new Error('ADMIN_REQUIRED');
    const client = this.getClient();
    await client.setDocument(`moderationStatus/${uid}`, {
      suspended,
      reason: reason.trim().slice(0, 300),
      updated_at: nowIso(),
      admin_uid: client.currentSession?.uid || '',
    }, { merge: true });
  }

  async adminResolveReport(reportId: string, status: 'resolved' | 'dismissed') {
    if (!await this.isAdmin()) throw new Error('ADMIN_REQUIRED');
    await this.getClient().setDocument(`reports/${reportId}`, { status, updated_at: nowIso() }, { merge: true });
  }

  async submitVerification(imageData: string) {
    const client = this.getClient();
    const uid = client.currentSession?.uid;
    if (!uid) throw new Error('AUTH_REQUIRED');
    if (!imageData.startsWith('data:image/')) throw new Error('Imagen de credencial inválida.');
    const existing = await client.getDocument<any>(`verificationRequests/${uid}`);
    const at = nowIso();
    if (existing) {
      await client.setDocument(`verificationRequests/${uid}`, { status: 'pending', image_data: imageData, updated_at: at }, { merge: true });
    } else {
      await client.setDocument(`verificationRequests/${uid}`, { uid, status: 'pending', image_data: imageData, created_at: at, updated_at: at }, { exists: false });
    }
  }

  async submitReport(targetType: 'product' | 'user' | 'chat', targetId: string, reason: string) {
    const client = this.getClient();
    const uid = client.currentSession?.uid;
    if (!uid) throw new Error('AUTH_REQUIRED');
    const reportId = id('report');
    await client.setDocument(`reports/${reportId}`, { created_by: uid, target_type: targetType, target_id: targetId, reason: reason.trim().slice(0, 500), status: 'open', created_at: nowIso(), updated_at: nowIso() }, { exists: false });
    return reportId;
  }
}

export const onlineBackend = new TuTopOnlineBackend();
