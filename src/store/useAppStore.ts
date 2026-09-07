import { create } from 'zustand';
import { sellerLevelFor } from '../lib/productAssistant';
import { onlineBackend, type OnlineSnapshot } from '../services/onlineBackend';
import { feedbackMessage } from '../lib/feedback';
import type { AppNotification, AppTab, Chat, Product, Review, User, WalletTransaction } from '../types';

interface AppState {
  user: User;
  products: Product[];
  chats: Chat[];
  reviews: Review[];
  transactions: WalletTransaction[];
  notifications: AppNotification[];
  currentFacultad: string;
  favorites: string[];
  activeTab: AppTab;
  activeChatId: string | null;
  selectedProductId: string | null;
  isAdmin: boolean;
  onlineReady: boolean;
  syncError: string | null;

  hydrateOnline: (snapshot: OnlineSnapshot) => void;
  clearOnline: () => void;
  setSyncError: (message: string | null) => void;
  setUser: (user: User) => void;
  setActiveTab: (tab: AppTab) => void;
  openProduct: (productId: string) => void;
  closeProduct: () => void;
  addProduct: (product: Product) => void;
  publishProduct: (product: Product, bidAmount?: number) => Promise<boolean>;
  updateProduct: (id: string, updates: Partial<Product>) => void;
  removeProduct: (id: string) => void;
  addChat: (chat: Chat) => void;
  updateChat: (id: string, updates: Partial<Chat>) => void;
  contactProduct: (productId: string) => string | null;
  openChat: (chatId: string) => void;
  closeChat: () => void;
  sendMessage: (chatId: string, text: string) => void;
  sendImageMessage: (chatId: string, imageUrl: string) => void;
  markChatRead: (chatId: string) => void;
  confirmDelivery: (chatId: string) => void;
  submitReview: (chatId: string, rating: Review['calificacion'], comment?: string) => boolean;
  setCurrentFacultad: (facultad: string) => void;
  bidProduct: (productId: string, amount: number) => Promise<boolean>;
  toggleFavorite: (productId: string) => void;
  markNotificationRead: (notificationId: string) => void;
  markAllNotificationsRead: () => void;
}

const NEUTRAL_COMMUNITY_LABEL = 'Comunidad universitaria';
const favoriteMutationVersion = new Map<string, number>();

function favoriteState(favorites: string[], productId: string, favorited: boolean) {
  const exists = favorites.includes(productId);
  if (exists === favorited) return favorites;
  return favorited ? [...favorites, productId] : favorites.filter((id) => id !== productId);
}

const emptyUser: User = {
  id: '', telefono: '', nombre: '', facultad: NEUTRAL_COMMUNITY_LABEL, saldo_ucoins: 0,
  puntos_prestigio: 0, nivel_vendedor: 'Novato', esta_verificado: false, strikes: 0,
  fecha_registro: new Date(0).toISOString(),
};

function blankState() {
  return {
    user: emptyUser,
    products: [] as Product[],
    chats: [] as Chat[],
    reviews: [] as Review[],
    transactions: [] as WalletTransaction[],
    notifications: [] as AppNotification[],
    currentFacultad: NEUTRAL_COMMUNITY_LABEL,
    favorites: [] as string[],
    activeTab: 'feed' as AppTab,
    activeChatId: null as string | null,
    selectedProductId: null as string | null,
    isAdmin: false,
    onlineReady: false,
    syncError: null as string | null,
  };
}

function localId(prefix: string) {
  const random = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${random}`;
}

function reportSyncError(set: (partial: Partial<AppState>) => void, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.error('[TuTop online sync]', error);
  set({ syncError: message });
}

export const useAppStore = create<AppState>((set, get) => ({
  ...blankState(),

  hydrateOnline: (snapshot) => set((state) => {
    const readNotifications = new Set(state.notifications.filter((item) => item.read).map((item) => item.id));
    return {
      ...snapshot,
      notifications: snapshot.notifications.map((item) => readNotifications.has(item.id) ? { ...item, read: true } : item),
      currentFacultad: state.user.id ? state.currentFacultad : snapshot.user.facultad,
      activeTab: state.activeTab,
      activeChatId: state.activeChatId,
      selectedProductId: state.selectedProductId,
      onlineReady: true,
      syncError: null,
    };
  }),
  clearOnline: () => set(blankState()),
  setSyncError: (syncError) => set({ syncError }),
  setUser: (user) => set({ user }),
  setActiveTab: (activeTab) => set({ activeTab }),
  openProduct: (selectedProductId) => set({ selectedProductId }),
  closeProduct: () => set({ selectedProductId: null }),
  setCurrentFacultad: (currentFacultad) => set({ currentFacultad }),

  addProduct: (product) => {
    set((state) => ({ products: [product, ...state.products] }));
    void onlineBackend.createProduct(product).catch((error) => {
      set((state) => ({ products: state.products.filter((item) => item.id !== product.id) }));
      reportSyncError(set, error);
    });
  },

  publishProduct: async (product, bidAmount = 0) => {
    try {
      await onlineBackend.createProduct(product);
      if (bidAmount > 0) await onlineBackend.bidProduct(product, bidAmount);
      const snapshot = await onlineBackend.loadSnapshot();
      get().hydrateOnline(snapshot);
      return true;
    } catch (error) {
      reportSyncError(set, error);
      return false;
    }
  },

  updateProduct: (id, updates) => {
    const before = get().products.find((product) => product.id === id);
    set((state) => ({ products: state.products.map((product) => product.id === id ? { ...product, ...updates } : product) }));
    void onlineBackend.updateProduct(id, updates).catch((error) => {
      if (before) set((state) => ({ products: state.products.map((product) => product.id === id ? before : product) }));
      reportSyncError(set, error);
    });
  },

  removeProduct: (id) => {
    // Zero-cost beta keeps an audit trail: hiding is represented as Vendido rather than hard deletion.
    get().updateProduct(id, { estado: 'Vendido', es_top: false, jerarquia_top: 0 });
  },

  addChat: (chat) => {
    set((state) => ({ chats: [chat, ...state.chats] }));
    void onlineBackend.createChat(chat).catch((error) => reportSyncError(set, error));
  },
  updateChat: (id, updates) => set((state) => ({ chats: state.chats.map((chat) => chat.id === id ? { ...chat, ...updates } : chat) })),

  contactProduct: (productId) => {
    const state = get();
    const product = state.products.find((item) => item.id === productId);
    if (!product || product.vendedor_id === state.user.id) return null;
    const existing = state.chats.find((chat) => chat.producto_id === productId && chat.comprador_id === state.user.id && chat.vendedor_id === product.vendedor_id);
    const chatId = existing?.id || `chat-${state.user.id}-${product.id}`;
    if (!existing) {
      const chat: Chat = {
        id: chatId,
        producto_id: product.id,
        comprador_id: state.user.id,
        vendedor_id: product.vendedor_id,
        nombre_otro_usuario: product.vendedor_nombre,
        mensajes: [],
        entrega_confirmada: false,
        entrega_estado: 'negociando',
        confirmaciones_entrega: { comprador: false, vendedor: false },
        sin_leer: 0,
      };
      set((current) => ({ chats: [chat, ...current.chats] }));
      void onlineBackend.createChat(chat).catch((error) => {
        set((current) => ({
          chats: current.chats.filter((item) => item.id !== chatId),
          activeChatId: current.activeChatId === chatId ? null : current.activeChatId,
        }));
        reportSyncError(set, error);
      });
    }
    set({ activeTab: 'inbox', activeChatId: chatId, selectedProductId: null });
    return chatId;
  },

  openChat: (chatId) => { set({ activeChatId: chatId, activeTab: 'inbox' }); get().markChatRead(chatId); },
  closeChat: () => set({ activeChatId: null }),

  sendMessage: (chatId, text) => {
    const clean = text.trim();
    if (!clean) return;
    const state = get();
    const chat = state.chats.find((item) => item.id === chatId);
    if (!chat) return;
    const emisor = chat.comprador_id === state.user.id ? 'comprador' : 'vendedor';
    const message = { id: localId('msg-local'), sender_id: state.user.id, emisor, texto: clean.slice(0, 1500), hora: new Date().toISOString(), leido: true } as const;
    set((current) => ({ chats: current.chats.map((item) => item.id === chatId ? { ...item, mensajes: [...item.mensajes, message], sin_leer: 0 } : item) }));
    void onlineBackend.sendMessage(chatId, clean).then(async () => {
      const snapshot = await onlineBackend.loadSnapshot();
      get().hydrateOnline(snapshot);
    }).catch((error) => {
      set((current) => ({ chats: current.chats.map((item) => item.id === chatId ? chat : item) }));
      reportSyncError(set, error);
    });
  },

  sendImageMessage: (chatId, imageUrl) => {
    const state = get();
    const chat = state.chats.find((item) => item.id === chatId);
    if (!chat || !imageUrl.startsWith('data:image/')) return;
    const emisor = chat.comprador_id === state.user.id ? 'comprador' : 'vendedor';
    const message = { id: localId('msg-local'), sender_id: state.user.id, emisor, texto: '', image_url: imageUrl, hora: new Date().toISOString(), leido: true } as const;
    set((current) => ({ chats: current.chats.map((item) => item.id === chatId ? { ...item, mensajes: [...item.mensajes, message], sin_leer: 0 } : item) }));
    feedbackMessage();
    void onlineBackend.sendMessage(chatId, '', imageUrl).then(async () => {
      get().hydrateOnline(await onlineBackend.loadSnapshot());
    }).catch((error) => {
      set((current) => ({ chats: current.chats.map((item) => item.id === chatId ? chat : item) }));
      reportSyncError(set, error);
    });
  },

  markChatRead: (chatId) => {
    const before = get().chats.find((chat) => chat.id === chatId);
    set((state) => ({ chats: state.chats.map((chat) => chat.id === chatId ? { ...chat, sin_leer: 0 } : chat) }));
    void onlineBackend.markChatRead(chatId).catch((error) => {
      if (before) set((state) => ({ chats: state.chats.map((chat) => chat.id === chatId ? before : chat) }));
      reportSyncError(set, error);
    });
  },

  confirmDelivery: (chatId) => {
    const state = get();
    const chat = state.chats.find((item) => item.id === chatId);
    if (!chat || chat.entrega_confirmada) return;
    const isBuyer = chat.comprador_id === state.user.id;
    const confirmations = { comprador: Boolean(chat.confirmaciones_entrega?.comprador), vendedor: Boolean(chat.confirmaciones_entrega?.vendedor) };
    if (isBuyer) confirmations.comprador = true; else confirmations.vendedor = true;
    set((current) => ({ chats: current.chats.map((item) => item.id === chatId ? { ...item, confirmaciones_entrega: confirmations, entrega_confirmada: confirmations.comprador && confirmations.vendedor, entrega_estado: confirmations.comprador && confirmations.vendedor ? 'completada' : 'esperando_confirmacion' } : item) }));
    void onlineBackend.confirmDelivery(chatId).then(async () => get().hydrateOnline(await onlineBackend.loadSnapshot())).catch((error) => {
      set((current) => ({ chats: current.chats.map((item) => item.id === chatId ? chat : item) }));
      reportSyncError(set, error);
    });
  },

  submitReview: (chatId, calificacion, comentario) => {
    const state = get();
    const chat = state.chats.find((item) => item.id === chatId);
    if (!chat || !chat.entrega_confirmada) return false;
    if (state.reviews.some((review) => review.chat_id === chatId && review.evaluador_id === state.user.id)) return false;
    const evaluadoId = chat.comprador_id === state.user.id ? chat.vendedor_id : chat.comprador_id;
    const review: Review = { id: `${chatId}_${state.user.id}`, chat_id: chatId, evaluador_id: state.user.id, evaluado_id: evaluadoId, calificacion, comentario: comentario?.trim().slice(0, 500), fecha: new Date().toISOString() };
    set((current) => ({ reviews: [review, ...current.reviews] }));
    void onlineBackend.submitReview(chat, calificacion, comentario).then(async () => get().hydrateOnline(await onlineBackend.loadSnapshot())).catch((error) => {
      set((current) => ({ reviews: current.reviews.filter((item) => item.id !== review.id) }));
      reportSyncError(set, error);
    });
    return true;
  },

  bidProduct: async (productId, amount) => {
    const state = get();
    const product = state.products.find((item) => item.id === productId);
    if (!product) return false;
    try {
      await onlineBackend.bidProduct(product, amount);
      get().hydrateOnline(await onlineBackend.loadSnapshot());
      return true;
    } catch (error) {
      reportSyncError(set, error);
      return false;
    }
  },

  toggleFavorite: (productId) => {
    const state = get();
    const wasFavorite = state.favorites.includes(productId);
    const shouldFavorite = !wasFavorite;
    const version = (favoriteMutationVersion.get(productId) || 0) + 1;
    favoriteMutationVersion.set(productId, version);
    set({ favorites: favoriteState(state.favorites, productId, shouldFavorite) });

    void onlineBackend.toggleFavorite(productId, shouldFavorite).catch((error) => {
      // An older request must never roll back a newer tap. Restore only this product
      // and leave unrelated favorite mutations untouched.
      if (favoriteMutationVersion.get(productId) === version) {
        set((current) => ({ favorites: favoriteState(current.favorites, productId, wasFavorite) }));
      }
      reportSyncError(set, error);
    });
  },

  markNotificationRead: (notificationId) => {
    const notification = get().notifications.find((item) => item.id === notificationId);
    set((state) => ({ notifications: state.notifications.map((item) => item.id === notificationId ? { ...item, read: true } : item) }));
    if (notification?.kind === 'message' && notification.chat_id) get().markChatRead(notification.chat_id);
  },
  markAllNotificationsRead: () => {
    const chatIds = [...new Set(get().notifications.filter((item) => !item.read && item.kind === 'message' && item.chat_id).map((item) => item.chat_id as string))];
    set((state) => ({ notifications: state.notifications.map((notification) => ({ ...notification, read: true })) }));
    for (const chatId of chatIds) get().markChatRead(chatId);
  },
}));

export function localReliability(user: User) {
  return Math.max(0, Math.min(100, 100 - user.strikes * 15));
}

export function currentSellerLevel(points: number) {
  return sellerLevelFor(points);
}
