export type AppTab = 'feed' | 'bot' | 'wallet' | 'inbox' | 'profile';
export type SellerLevel = 'Novato' | 'Pro' | 'Leyenda';
export type ProductStatus = 'Activo' | 'Pausado' | 'Vendido';
export type ProductCategory = 'Electrónica' | 'Ropa & Accesorios' | 'Libros & Apuntes' | 'Apuntes & Guías' | 'Comida' | 'Postres' | 'Servicios' | 'Transporte' | 'Cuartos & Renta' | 'Eventos' | 'Arte & Manualidades' | 'Otros';
export type MeetingPoint = 'Cafetería Central' | 'Puerta Principal' | 'Salón de Clases' | 'Coordinar por Chat';
export type DeliveryStatus = 'negociando' | 'acordada' | 'esperando_confirmacion' | 'completada' | 'cancelada';
export type NotificationKind = 'message' | 'bid' | 'delivery' | 'verification' | 'system';

export interface User {
  id: string;
  telefono: string;
  nombre: string;
  facultad: string;
  saldo_ucoins: number;
  puntos_prestigio: number;
  nivel_vendedor: SellerLevel;
  esta_verificado: boolean;
  strikes: number;
  fecha_registro: string;
  avatar_url?: string;
  suspended_until?: string | null;
  is_suspended?: boolean;
  suspension_reason?: string;
}

export interface Product {
  id: string;
  vendedor_id: string;
  vendedor_nombre: string;
  vendedor_handle?: string;
  vendedor_verificado?: boolean;
  titulo: string;
  descripcion?: string;
  precio_mxn: number;
  stock?: number;
  categoria: ProductCategory;
  facultad: string;
  punto_encuentro: MeetingPoint;
  imagen_url: string;
  imagenes_url?: string[];
  estado: ProductStatus;
  es_top: boolean;
  jerarquia_top: 0 | 1 | 2 | 3;
  puja_ucoins?: number;
  likes?: number;
  fecha_creacion: string;
}

export interface Review {
  id: string;
  chat_id: string;
  evaluador_id: string;
  evaluado_id: string;
  calificacion: 'positive' | 'negative';
  comentario?: string;
  fecha: string;
}

export interface ChatMessage {
  id?: string;
  sender_id?: string;
  emisor: 'comprador' | 'vendedor';
  texto: string;
  image_url?: string;
  hora: string;
  leido?: boolean;
}

export interface Chat {
  id: string;
  producto_id: string;
  comprador_id: string;
  vendedor_id: string;
  nombre_otro_usuario: string;
  mensajes: ChatMessage[];
  entrega_confirmada: boolean;
  entrega_estado?: DeliveryStatus;
  confirmaciones_entrega?: {
    comprador: boolean;
    vendedor: boolean;
  };
  sin_leer?: number;
}

export interface Message {
  emisor: 'user' | 'bot';
  texto: string;
  image_url?: string;
  hora: string;
}

export interface ProductFormData {
  titulo: string;
  descripcion?: string;
  precio_mxn: number;
  stock?: number;
  categoria: ProductCategory;
  facultad: string;
  punto_encuentro: MeetingPoint;
  imagen_url?: string;
  imagenes_url?: string[];
}

export interface WalletTransaction {
  id: string;
  type: 'income' | 'expense';
  description: string;
  amount: number;
  date: string;
  operation_id?: string;
}

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  created_at: string;
  read: boolean;
  chat_id?: string;
  product_id?: string;
}

export interface AssistantResult {
  blocked?: boolean;
  response: string;
  data: Partial<ProductFormData>;
  complete: boolean;
  needs?: keyof ProductFormData | null;
}
