export type ErasureDisposition = 'delete' | 'withdraw' | 'retain_operational';

export type ErasureCollectionRule = {
  collection: string;
  owner_field?: string;
  disposition: ErasureDisposition;
  reason: string;
};

export const ACCOUNT_ERASURE_POLICY: ErasureCollectionRule[] = [
  { collection: 'users', disposition: 'delete', reason: 'Perfil principal; se elimina después de retirar contenido público.' },
  { collection: 'user_private', disposition: 'delete', reason: 'PII privada directa.' },
  { collection: 'notification_preferences', disposition: 'delete', reason: 'Preferencias personales.' },
  { collection: 'device_tokens', owner_field: 'owner_uid', disposition: 'delete', reason: 'Token de dispositivo revocable.' },
  { collection: 'notification_receipts', owner_field: 'owner_uid', disposition: 'delete', reason: 'Estado personal de lectura.' },
  { collection: 'favorites', owner_field: 'uid', disposition: 'delete', reason: 'Preferencia personal.' },
  { collection: 'saved_searches', owner_field: 'owner_uid', disposition: 'delete', reason: 'Preferencia/búsqueda personal.' },
  { collection: 'wallets', disposition: 'delete', reason: 'Saldo interno UCoins vinculado a una cuenta eliminada.' },
  { collection: 'wallet_transactions', owner_field: 'user_id', disposition: 'delete', reason: 'Ledger beta interno sin valor monetario; no se conserva como identidad activa.' },
  { collection: 'verificationRequests', disposition: 'delete', reason: 'Evidencia privada de verificación cuando no existe retención activa.' },
  { collection: 'publicVerifications', disposition: 'delete', reason: 'Badge deja de ser necesario al eliminar la cuenta.' },
  { collection: 'reputation', disposition: 'delete', reason: 'Perfil agregado del usuario eliminado.' },
  { collection: 'moderationStatus', disposition: 'delete', reason: 'Estado de cuenta ya inexistente.' },
  { collection: 'listings_v2', owner_field: 'seller_id', disposition: 'withdraw', reason: 'Retirar del marketplace sin romper referencias transaccionales.' },
  { collection: 'demand_requests', owner_field: 'buyer_id', disposition: 'withdraw', reason: 'Retirar solicitudes abiertas de demanda.' },
  { collection: 'account_deletion_requests', disposition: 'retain_operational', reason: 'Conservar evidencia mínima del cumplimiento de la solicitud.' },
  { collection: 'transactions_v2', disposition: 'retain_operational', reason: 'Integridad de disputas, cumplimiento y auditoría.' },
  { collection: 'offers', disposition: 'retain_operational', reason: 'Integridad del historial de negociación.' },
  { collection: 'chats', disposition: 'retain_operational', reason: 'Puede contener evidencia de una operación o disputa.' },
  { collection: 'reviews', disposition: 'retain_operational', reason: 'Evidencia de operaciones y confianza del marketplace.' },
  { collection: 'reports', disposition: 'retain_operational', reason: 'Seguridad, fraude y moderación.' },
  { collection: 'audit_log', disposition: 'retain_operational', reason: 'Auditoría administrativa inmutable.' },
];

export function erasureRuleFor(collection: string) {
  return ACCOUNT_ERASURE_POLICY.find((item) => item.collection === collection) || null;
}

export function deletionCollections() {
  return ACCOUNT_ERASURE_POLICY.filter((item) => item.disposition === 'delete');
}

export function withdrawalCollections() {
  return ACCOUNT_ERASURE_POLICY.filter((item) => item.disposition === 'withdraw');
}

export function retainedCollections() {
  return ACCOUNT_ERASURE_POLICY.filter((item) => item.disposition === 'retain_operational');
}
