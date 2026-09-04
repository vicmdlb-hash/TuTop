import type { AppNotification, Chat, Product, ProductFormData, Review, User, WalletTransaction } from '../types';

/**
 * Contratos de dominio para mantener una frontera estable entre la UI y Firebase.
 * No contienen SDK de Firebase a propósito: permiten evolucionar la implementación online sin reescribir los componentes.
 */
export interface AuthGateway {
  getCurrentUser(): Promise<User | null>;
  signInWithPhone(phoneE164: string): Promise<{ verificationId: string }>;
  confirmPhoneCode(verificationId: string, code: string): Promise<User>;
  signOut(): Promise<void>;
  deleteMyAccount(): Promise<void>;
}

export interface ProductGateway {
  listProducts(input: { faculty: string; category?: string; search?: string; cursor?: string }): Promise<{ items: Product[]; nextCursor?: string }>;
  getProduct(productId: string): Promise<Product | null>;
  createProduct(input: ProductFormData & { imagePath: string }): Promise<Product>;
  updateProduct(productId: string, patch: Partial<ProductFormData> & { estado?: Product['estado'] }): Promise<Product>;
}

export interface ChatGateway {
  createOrGetChat(productId: string): Promise<Chat>;
  subscribeChats(onChange: (chats: Chat[]) => void): () => void;
  subscribeMessages(chatId: string, onChange: (chat: Chat) => void): () => void;
  sendMessage(chatId: string, text: string): Promise<void>;
  confirmDelivery(chatId: string): Promise<void>;
  submitReview(chatId: string, rating: Review['calificacion'], comment?: string): Promise<void>;
}

export interface WalletGateway {
  getWallet(): Promise<{ user: Pick<User, 'saldo_ucoins' | 'puntos_prestigio' | 'nivel_vendedor'>; ledger: WalletTransaction[] }>;
  placeBid(input: { productId: string; amount: number; operationId: string }): Promise<void>;
}

export interface NotificationGateway {
  subscribeNotifications(onChange: (items: AppNotification[]) => void): () => void;
  markRead(notificationId: string): Promise<void>;
  registerPushToken(token: string, platform: 'android' | 'web'): Promise<void>;
  removePushToken(token: string): Promise<void>;
}

export interface MediaGateway {
  uploadProductImage(file: Blob, productDraftId: string): Promise<{ storagePath: string; downloadUrl: string }>;
  uploadVerificationImage(file: Blob): Promise<{ storagePath: string }>;
}

export interface TuTopBackend {
  auth: AuthGateway;
  products: ProductGateway;
  chats: ChatGateway;
  wallet: WalletGateway;
  notifications: NotificationGateway;
  media: MediaGateway;
}
