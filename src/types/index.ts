export type AppTab = 'feed' | 'bot' | 'wallet' | 'inbox' | 'profile';
export type SellerLevel = 'Novato' | 'Pro' | 'Leyenda';
export type ProductStatus = 'Activo' | 'Reservado' | 'Pausado' | 'Vendido' | 'Agotado';
export type ProductCategory =
  | 'Electrónica'
  | 'Ropa & Accesorios'
  | 'Libros & Apuntes'
  | 'Apuntes & Guías'
  | 'Material Escolar'
  | 'Comida'
  | 'Postres'
  | 'Servicios'
  | 'Transporte'
  | 'Hogar'
  | 'Deportes'
  | 'Videojuegos'
  | 'Coleccionables'
  | 'Arte & Manualidades'
  | 'Eventos'
  | 'Entradas permitidas'
  | 'Belleza & Cuidado'
  | 'Mascotas'
  | 'Instrumentos Musicales'
  | 'Cuartos & Renta'
  | 'Otros';
export type ProductCondition = 'Nuevo' | 'Como nuevo' | 'Buen estado' | 'Uso visible' | 'Para reparar' | 'No aplica';
export type MeetingPoint =
  | 'Cafetería Central'
  | 'Puerta Principal'
  | 'Biblioteca'
  | 'Facultad'
  | 'Estacionamiento'
  | 'Rectoría'
  | 'Salón de Clases'
  | 'Campus específico'
  | 'Otro punto público'
  | 'Coordinar por Chat';
export type DeliveryMethod = 'Nos encontramos' | 'Recoge conmigo' | 'Yo entrego' | 'Acordamos por chat' | 'Envío local' | 'Punto TuTop';
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
  precio_negociable?: boolean;
  stock?: number;
  categoria: ProductCategory;
  subcategoria?: string;
  condicion?: ProductCondition;
  marca?: string;
  modelo?: string;
  talla?: string;
  color?: string;
  etiquetas?: string[];
  facultad: string;
  punto_encuentro: MeetingPoint;
  punto_personalizado?: string;
  metodos_entrega?: DeliveryMethod[];
  dias_entrega?: string[];
  horario_entrega?: string;
  disponibilidad?: string;
  imagen_url: string;
  imagenes_url?: string[];
  estado: ProductStatus;
  es_top: boolean;
  jerarquia_top: 0 | 1 | 2 | 3;
  puja_ucoins?: number;
  likes?: number;
  fecha_creacion: string;
  updated_at?: string;
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
  precio_negociable?: boolean;
  stock?: number;
  categoria: ProductCategory;
  subcategoria?: string;
  condicion?: ProductCondition;
  marca?: string;
  modelo?: string;
  talla?: string;
  color?: string;
  etiquetas?: string[];
  facultad: string;
  punto_encuentro: MeetingPoint;
  punto_personalizado?: string;
  metodos_entrega?: DeliveryMethod[];
  dias_entrega?: string[];
  horario_entrega?: string;
  disponibilidad?: string;
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
