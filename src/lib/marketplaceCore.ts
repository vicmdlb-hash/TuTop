import type { MarketplaceTransactionStatus, Offer, OfferStatus, Product, ReputationMetrics, User } from '../types';

export type OfferAction = 'accept' | 'reject' | 'counter' | 'withdraw' | 'expire';

const offerTransitions: Record<OfferStatus, Partial<Record<OfferAction, OfferStatus>>> = {
  pending: { accept: 'accepted', reject: 'rejected', counter: 'countered', withdraw: 'withdrawn', expire: 'expired' },
  accepted: {},
  rejected: {},
  countered: {},
  withdrawn: {},
  expired: {},
};

export function nextOfferStatus(current: OfferStatus, action: OfferAction): OfferStatus | null {
  return offerTransitions[current][action] || null;
}

export function canActOnOffer(offer: Pick<Offer, 'buyer_id' | 'seller_id' | 'status'>, actorUid: string, action: OfferAction) {
  if (offer.status !== 'pending') return false;
  if (action === 'withdraw') return actorUid === offer.buyer_id;
  if (action === 'accept' || action === 'reject' || action === 'counter') return actorUid === offer.seller_id;
  return action === 'expire';
}

export function reservationExpiry(minutes: 30 | 120 | 1440, now = new Date()) {
  return new Date(now.getTime() + minutes * 60_000).toISOString();
}

export function transactionStatusAfterReservation(current: MarketplaceTransactionStatus, expiresAt?: string, now = new Date()): MarketplaceTransactionStatus {
  if (current !== 'reserved') return current;
  if (!expiresAt) return 'reserved';
  return Date.parse(expiresAt) <= now.getTime() ? 'expired' : 'reserved';
}

export function bothDeliveryConfirmations(buyerConfirmed?: string, sellerConfirmed?: string) {
  return Boolean(buyerConfirmed && sellerConfirmed);
}

export function reputationScore(metrics: ReputationMetrics) {
  const completed = Math.min(1, metrics.completed_transactions / 30);
  const ratings = [metrics.seller_rating, metrics.buyer_rating].filter((value): value is number => typeof value === 'number');
  const rating = ratings.length ? ratings.reduce((sum, value) => sum + value, 0) / ratings.length / 5 : 0.6;
  const punctuality = typeof metrics.punctuality_rate === 'number' ? Math.max(0, Math.min(1, metrics.punctuality_rate / 100)) : 0.6;
  const response = typeof metrics.median_response_minutes === 'number' ? Math.max(0, 1 - Math.min(metrics.median_response_minutes, 1440) / 1440) : 0.5;
  const negative = Math.min(1, metrics.cancellations * 0.03 + metrics.no_shows * 0.12 + metrics.reports_upheld * 0.2);
  return Math.max(0, Math.min(100, Math.round((completed * 0.2 + rating * 0.35 + punctuality * 0.2 + response * 0.1 + (1 - negative) * 0.15) * 100)));
}

export function normalizeSearchText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-MX')
    .replace(/iphone\s*(\d+)/g, 'iphone $1')
    .replace(/\bcel(?:ular)?\b/g, 'telefono')
    .replace(/\bcompu(?:tadora)?\b/g, 'laptop')
    .replace(/\bapuntes?\b/g, 'apunte')
    .replace(/\bmicroeconomia\b/g, 'micro economia')
    .replace(/[^a-z0-9ñ]+/g, ' ')
    .trim();
}

function tokenScore(needle: string, haystack: string) {
  if (!needle) return 1;
  if (haystack.includes(needle)) return 1;
  const wanted = needle.split(' ').filter(Boolean);
  if (!wanted.length) return 1;
  const matched = wanted.filter((token) => haystack.includes(token)).length;
  return matched / wanted.length;
}

export type RankingContext = {
  query?: string;
  user?: Pick<User, 'institution_id' | 'campus_id' | 'university'>;
  favoriteCategories?: string[];
  now?: Date;
};

export function marketplaceRelevance(product: Product, context: RankingContext) {
  const now = context.now || new Date();
  const search = normalizeSearchText(`${product.titulo} ${product.descripcion || ''} ${product.categoria} ${product.subcategoria || ''} ${product.marca || ''} ${product.modelo || ''} ${(product.etiquetas || []).join(' ')}`);
  const query = normalizeSearchText(context.query || '');
  const queryFit = tokenScore(query, search);
  const userInstitution = context.user?.institution_id || context.user?.university?.institution_id;
  const userCampus = context.user?.campus_id || context.user?.university?.campus_id;
  const locality = product.campus_id && userCampus === product.campus_id ? 1 : product.institution_id && userInstitution === product.institution_id ? 0.72 : product.visibility_scope === 'national' ? 0.2 : 0.35;
  const ageDays = Math.max(0, (now.getTime() - Date.parse(product.fecha_creacion)) / 86400000);
  const freshness = Math.max(0, 1 - ageDays / 45);
  const categoryAffinity = context.favoriteCategories?.includes(product.categoria) ? 1 : 0;
  const quality = Math.min(1, (Number(Boolean(product.imagen_url)) * 0.25 + Number(Boolean(product.descripcion && product.descripcion.length > 40)) * 0.25 + Number(Boolean(product.condicion)) * 0.15 + Number(Boolean(product.metodos_entrega?.length)) * 0.15 + Number(Boolean(product.vendedor_verificado)) * 0.2));
  const popularity = Math.min(1, (product.likes || 0) / 20);
  const availability = product.estado === 'Activo' ? 1 : product.estado === 'Reservado' ? 0.25 : 0;
  const topBoost = product.es_top ? 0.12 : 0;
  return queryFit * 0.31 + locality * 0.21 + freshness * 0.16 + categoryAffinity * 0.11 + quality * 0.11 + popularity * 0.05 + availability * 0.05 + topBoost;
}

export function sortMarketplace(products: Product[], context: RankingContext) {
  return [...products].sort((a, b) => marketplaceRelevance(b, context) - marketplaceRelevance(a, context));
}

export const prohibitedMarketplacePatterns: Array<{ code: string; pattern: RegExp; reason: string }> = [
  { code: 'weapon', pattern: /\b(arma|pistola|rifle|municion|cartucho)\b/i, reason: 'Armas y municiones no están permitidas.' },
  { code: 'drug', pattern: /\b(cocaina|metanfetamina|fentanilo|marihuana|lsd)\b/i, reason: 'Drogas y sustancias ilegales no están permitidas.' },
  { code: 'credential', pattern: /\b(credencial|ine|pasaporte)\b.*\b(vendo|venta|falsa|clon)/i, reason: 'Documentos oficiales o credenciales no pueden comercializarse.' },
  { code: 'account', pattern: /\b(cuenta|perfil)\b.*\b(robada|hackeada|crackeada)/i, reason: 'Cuentas digitales robadas o comprometidas están prohibidas.' },
  { code: 'restricted-medicine', pattern: /\b(clonazepam|alprazolam|tramadol|antibiotico)\b/i, reason: 'Medicamentos restringidos no pueden venderse en TuTop.' },
];

export function marketplacePolicyCheck(text: string) {
  const hits = prohibitedMarketplacePatterns.filter((rule) => rule.pattern.test(text));
  return { allowed: hits.length === 0, hits };
}

export function suspiciousMessageSignals(text: string) {
  const normalized = normalizeSearchText(text);
  const signals: string[] = [];
  if (/codigo.*(sms|verificacion|otp)|otp.*codigo/.test(normalized)) signals.push('otp_request');
  if (/whatsapp|telegram/.test(normalized)) signals.push('move_off_platform');
  if (/deposito|transferencia/.test(normalized) && /antes|primero|aparta/.test(normalized)) signals.push('advance_payment');
  if (/http|www|\.com\b|\.mx\b/.test(text.toLowerCase())) signals.push('external_link');
  return signals;
}
