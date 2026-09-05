import type { DemandRequest, MarketplaceTransaction, MarketplaceTransactionStatus, Offer, OfferStatus, Product, ReputationMetrics, User } from '../types';

export type OfferAction = 'accept' | 'reject' | 'counter' | 'withdraw' | 'expire';
export type TransactionAction = 'schedule_meetup' | 'confirm_delivery' | 'dispute' | 'expire';

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

export function canActOnOffer(offer: Pick<Offer, 'buyer_id' | 'seller_id' | 'created_by' | 'status'>, actorUid: string, action: OfferAction) {
  if (offer.status !== 'pending') return false;
  const creator = offer.created_by || offer.buyer_id;
  const participant = actorUid === offer.buyer_id || actorUid === offer.seller_id;
  if (!participant && action !== 'expire') return false;
  if (action === 'withdraw') return actorUid === creator;
  if (action === 'accept' || action === 'reject' || action === 'counter') return actorUid !== creator;
  return action === 'expire';
}

export function canActOnTransaction(
  transaction: Pick<MarketplaceTransaction, 'buyer_id' | 'seller_id' | 'status' | 'reservation_expires_at' | 'buyer_confirmed_at' | 'seller_confirmed_at'>,
  actorUid: string,
  action: TransactionAction,
  now = new Date(),
) {
  const participant = actorUid === transaction.buyer_id || actorUid === transaction.seller_id;
  if (!participant) return false;
  if (action === 'schedule_meetup') {
    return ['reserved', 'meetup_scheduled'].includes(transaction.status)
      && !transaction.buyer_confirmed_at
      && !transaction.seller_confirmed_at;
  }
  if (action === 'confirm_delivery') {
    if (transaction.status !== 'meetup_scheduled') return false;
    if (actorUid === transaction.buyer_id) return !transaction.buyer_confirmed_at;
    return !transaction.seller_confirmed_at;
  }
  if (action === 'dispute') return ['reserved', 'meetup_scheduled'].includes(transaction.status);
  if (action === 'expire') {
    return actorUid === transaction.seller_id
      && transaction.status === 'reserved'
      && Boolean(transaction.reservation_expires_at)
      && Date.parse(transaction.reservation_expires_at || '') <= now.getTime();
  }
  return false;
}

export function transactionStatusForAction(
  transaction: Pick<MarketplaceTransaction, 'buyer_id' | 'seller_id' | 'status' | 'buyer_confirmed_at' | 'seller_confirmed_at'>,
  actorUid: string,
  action: TransactionAction,
): MarketplaceTransactionStatus | null {
  if (action === 'schedule_meetup') return 'meetup_scheduled';
  if (action === 'dispute') return 'disputed';
  if (action === 'expire') return 'expired';
  if (action === 'confirm_delivery') {
    const otherConfirmed = actorUid === transaction.buyer_id ? Boolean(transaction.seller_confirmed_at) : Boolean(transaction.buyer_confirmed_at);
    return otherConfirmed ? 'completed' : 'meetup_scheduled';
  }
  return null;
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

export function demandMatchScore(request: Pick<DemandRequest, 'title' | 'description' | 'category' | 'max_price_mxn' | 'institution_id' | 'campus_id' | 'city_id' | 'visibility_scope'>, product: Product) {
  if (product.estado !== 'Activo') return 0;
  if (typeof request.max_price_mxn === 'number' && product.precio_mxn > request.max_price_mxn) return 0;
  if (request.category && product.categoria !== request.category) return 0;

  const demandText = normalizeSearchText(`${request.title} ${request.description || ''}`);
  const listingText = normalizeSearchText(`${product.titulo} ${product.descripcion || ''} ${product.categoria} ${product.marca || ''} ${product.modelo || ''} ${(product.etiquetas || []).join(' ')}`);
  const textFit = tokenScore(demandText, listingText);
  if (textFit < 0.25) return 0;

  let locality = 0.35;
  if (request.campus_id && product.campus_id === request.campus_id) locality = 1;
  else if (request.institution_id && product.institution_id === request.institution_id) locality = 0.78;
  else if (request.city_id && product.city_id === request.city_id) locality = 0.62;
  else if (request.visibility_scope === 'national' && product.shipping_available) locality = 0.45;
  else if (request.visibility_scope === 'campus' || request.visibility_scope === 'institution') return 0;

  const budgetFit = typeof request.max_price_mxn === 'number' && request.max_price_mxn > 0
    ? Math.max(0, 1 - product.precio_mxn / request.max_price_mxn * 0.35)
    : 0.7;
  const verified = product.vendedor_verificado ? 1 : 0;
  const freshness = Math.max(0, 1 - Math.max(0, Date.now() - Date.parse(product.fecha_creacion)) / (45 * 86400000));
  return Math.min(1, textFit * 0.52 + locality * 0.23 + budgetFit * 0.12 + freshness * 0.08 + verified * 0.05);
}

export function matchDemandToListings(request: Pick<DemandRequest, 'title' | 'description' | 'category' | 'max_price_mxn' | 'institution_id' | 'campus_id' | 'city_id' | 'visibility_scope'>, products: Product[], limit = 6) {
  return products
    .map((product) => ({ product, score: demandMatchScore(request, product) }))
    .filter((match) => match.score >= 0.35)
    .sort((a, b) => b.score - a.score || Date.parse(b.product.fecha_creacion) - Date.parse(a.product.fecha_creacion))
    .slice(0, Math.max(1, limit));
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
