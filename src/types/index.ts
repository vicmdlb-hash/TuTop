export type AppTab = 'feed' | 'bot' | 'wallet' | 'inbox' | 'profile';
export type SellerLevel = 'Novato' | 'Pro' | 'Leyenda';
export type ProductStatus = 'Activo' | 'Reservado' | 'Pausado' | 'Vendido' | 'Agotado' | 'Archivado';
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
export type NotificationKind = 'message' | 'bid' | 'delivery' | 'verification' | 'offer' | 'reservation' | 'search' | 'safety' | 'system';

// TuTop 0.8.5+ national marketplace model. The legacy `facultad` field stays
// during migration so existing UATx documents remain readable.
export type VerificationLevel = 0 | 1 | 2 | 3 | 4;
export type VerificationBadge = 'Cuenta TuTop' | 'Universidad verificada' | 'Estudiante verificado' | 'Usuario confiable' | 'Vendedor destacado';
export type ListingVisibilityScope = 'campus' | 'institution' | 'university-zone' | 'city' | 'national';
export type ListingKind = 'offer' | 'wanted';
export type ModerationStatus = 'pending' | 'approved' | 'review' | 'rejected';
export type OfferStatus = 'pending' | 'accepted' | 'rejected' | 'countered' | 'withdrawn' | 'expired';
export type MarketplaceTransactionStatus = 'interest' | 'offer_sent' | 'countered' | 'accepted' | 'reserved' | 'meetup_scheduled' | 'completed' | 'cancelled' | 'expired' | 'no_show' | 'disputed';
export type TransactionOutcomeCode = 'buyer_cancelled' | 'seller_cancelled' | 'buyer_no_show' | 'seller_no_show' | 'mutual_cancel';

export interface UniversityIdentity {
  country_code: 'MX';
  state_code?: string;
  state_name?: string;
  city_id?: string;
  city_name?: string;
  institution_id?: string;
  institution_name?: string;
  campus_id?: string;
  campus_name?: string;
  faculty_id?: string;
  faculty_name?: string;
  career_id?: string;
  career_name?: string;
  community_id?: string;
  community_name?: string;
}

export interface Institution {
  id: string;
  name: string;
  short_name: string;
  country_code: 'MX';
  state_code: string;
  state_name: string;
  city_name: string;
  domains: string[];
  active: boolean;
}

export interface Campus {
  id: string;
  institution_id: string;
  name: string;
  city_name: string;
  state_code: string;
  zone_id?: string;
  latitude?: number;
  longitude?: number;
  active: boolean;
}

export interface FacultyCatalogItem {
  id: string;
  institution_id: string;
  campus_id?: string;
  name: string;
  careers?: Array<{ id: string; name: string }>;
}

export interface ApprovedMeetingPoint {
  id: string;
  campus_id: string;
  name: string;
  description?: string;
  kind: 'library' | 'entrance' | 'cafeteria' | 'rectory' | 'security' | 'student-center' | 'other-public';
  is_tutop_safe_point: boolean;
  active: boolean;
}

export interface ReputationMetrics {
  completed_transactions: number;
  seller_rating: number | null;
  buyer_rating: number | null;
  punctuality_rate: number | null;
  median_response_minutes: number | null;
  cancellations: number;
  no_shows: number;
  reports_upheld: number;
}

export interface User {
  id: string;
  telefono: string;
  nombre: string;
  facultad: string;
  institution_id?: string;
  campus_id?: string;
  faculty_id?: string;
  career_id?: string;
  university?: UniversityIdentity;
  institutional_email?: string;
  verification_level?: VerificationLevel;
  verification_badge?: VerificationBadge;
  saldo_ucoins: number;
  puntos_prestigio: number;
  nivel_vendedor: SellerLevel;
  esta_verificado: boolean;
  reputation?: ReputationMetrics;
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
  attributes?: Record<string, string | number | boolean | string[]>;
  facultad: string;
  country_code?: 'MX';
  state_code?: string;
  city_id?: string;
  city_name?: string;
  institution_id?: string;
  campus_id?: string;
  faculty_id?: string;
  career_id?: string;
  visibility_scope?: ListingVisibilityScope;
  listing_kind?: ListingKind;
  moderation_status?: ModerationStatus;
  punto_encuentro: MeetingPoint;
  meeting_point_id?: string;
  punto_personalizado?: string;
  metodos_entrega?: DeliveryMethod[];
  dias_entrega?: string[];
  horario_entrega?: string;
  disponibilidad?: string;
  shipping_available?: boolean;
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

export interface Offer {
  id: string;
  listing_id: string;
  chat_id: string;
  buyer_id: string;
  seller_id: string;
  created_by?: string;
  amount_mxn: number;
  status: OfferStatus;
  parent_offer_id?: string;
  counter_offer_id?: string;
  expires_at?: string;
  created_at: string;
  updated_at: string;
}

export interface MarketplaceTransaction {
  id: string;
  listing_id: string;
  chat_id: string;
  buyer_id: string;
  seller_id: string;
  accepted_offer_id?: string;
  agreed_amount_mxn?: number;
  status: MarketplaceTransactionStatus;
  reservation_expires_at?: string;
  meeting_point_id?: string;
  meetup_at?: string;
  buyer_confirmed_at?: string;
  seller_confirmed_at?: string;
  outcome_code?: TransactionOutcomeCode;
  outcome_actor_id?: string;
  outcome_recorded_at?: string;
  created_at: string;
  updated_at: string;
}

export interface DemandRequest {
  id: string;
  buyer_id: string;
  title: string;
  description?: string;
  category?: ProductCategory;
  max_price_mxn?: number;
  needed_by?: string;
  institution_id?: string;
  campus_id?: string;
  city_id?: string;
  visibility_scope: ListingVisibilityScope;
  status: 'active' | 'matched' | 'fulfilled' | 'paused' | 'expired';
  created_at: string;
  updated_at: string;
}

export interface SavedSearch {
  id: string;
  owner_uid: string;
  query: string;
  category?: ProductCategory;
  max_price_mxn?: number;
  institution_id?: string;
  campus_id?: string;
  visibility_scope: ListingVisibilityScope;
  notifications_enabled: boolean;
  created_at: string;
  updated_at: string;
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
  event_type?: 'offer' | 'offer_accepted' | 'offer_rejected' | 'counter_offer' | 'reservation' | 'meetup' | 'completion' | 'safety';
  related_offer_id?: string;
  related_transaction_id?: string;
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
  transaction_id?: string;
  current_offer_id?: string;
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
  attributes?: Record<string, string | number | boolean | string[]>;
  facultad: string;
  country_code?: 'MX';
  state_code?: string;
  city_id?: string;
  city_name?: string;
  institution_id?: string;
  campus_id?: string;
  faculty_id?: string;
  career_id?: string;
  visibility_scope?: ListingVisibilityScope;
  listing_kind?: ListingKind;
  punto_encuentro: MeetingPoint;
  meeting_point_id?: string;
  punto_personalizado?: string;
  metodos_entrega?: DeliveryMethod[];
  dias_entrega?: string[];
  horario_entrega?: string;
  disponibilidad?: string;
  shipping_available?: boolean;
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
  offer_id?: string;
  transaction_id?: string;
  saved_search_id?: string;
}

export interface AssistantResult {
  blocked?: boolean;
  response: string;
  data: Partial<ProductFormData>;
  complete: boolean;
  needs?: keyof ProductFormData | null;
}
