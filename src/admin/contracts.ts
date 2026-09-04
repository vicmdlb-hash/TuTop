/** Public TypeScript contract between MiTuTop Admin UI and privileged callable Functions. */

export interface AdminOverviewCounts {
  users: number;
  products: number;
  activeProducts: number;
  chats: number;
  openReports: number;
  pendingVerifications: number;
  rankings: number;
}

export interface AdminRecentProduct {
  id: string;
  titulo: string;
  categoria: string;
  facultad: string;
  estado: string;
  precio_mxn: number;
  vendedor_nombre: string;
  vendedor_verificado: boolean;
  es_top: boolean;
  jerarquia_top: number;
  created_at: string | null;
}

export interface AdminOverviewResponse {
  ok: true;
  counts: AdminOverviewCounts;
  recentProducts: AdminRecentProduct[];
  generated_at: string;
}

export interface AdminUserRow {
  id: string;
  nombre: string;
  facultad: string;
  telefono_masked: string;
  saldo_ucoins: number;
  puntos_prestigio: number;
  nivel_vendedor: string;
  esta_verificado: boolean;
  strikes: number;
  suspended_until: string | null;
  fecha_registro: string | null;
}

export interface AdminProductRow {
  id: string;
  vendedor_id: string;
  vendedor_nombre: string;
  titulo: string;
  categoria: string;
  facultad: string;
  punto_encuentro: string;
  precio_mxn: number;
  image_path: string;
  estado: string;
  es_top: boolean;
  jerarquia_top: number;
  fecha_creacion: string | null;
}

export interface AdminReportRow {
  id: string;
  reporter_id: string;
  type: 'product' | 'user' | 'chat';
  target_id: string;
  reason: string;
  status: string;
  created_at: string | null;
}

export interface AdminVerificationRow {
  id: string;
  user_id: string;
  status: string;
  created_at: string | null;
  updated_at: string | null;
}

export interface AdminDeletionRequestRow {
  id: string;
  phone_hint: string;
  contact_email: string;
  status: string;
  request_count: number;
  updated_at: string | null;
}

export interface AdminModerationResponse {
  ok: true;
  reports: AdminReportRow[];
  verifications: AdminVerificationRow[];
  deletionRequests: AdminDeletionRequestRow[];
}

export type AdminReportResolution = 'dismiss' | 'pause_product' | 'suspend_user_30d';

export interface AdminGateway {
  signInWithGoogle(): Promise<void>;
  signOut(): Promise<void>;
  bootstrapAdmin(): Promise<void>;
  getOverview(): Promise<AdminOverviewResponse>;
  listUsers(limit?: number): Promise<AdminUserRow[]>;
  listProducts(limit?: number): Promise<AdminProductRow[]>;
  listModeration(): Promise<AdminModerationResponse>;
  getVerificationEvidence(userId: string): Promise<{ url: string; expiresInSeconds: number }>;
  reviewVerification(userId: string, decision: 'approved' | 'rejected'): Promise<void>;
  resolveReport(reportId: string, action: AdminReportResolution): Promise<void>;
}
