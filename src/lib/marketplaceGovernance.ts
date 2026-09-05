import type { ListingVisibilityScope, ProductCategory, VerificationLevel } from '../types';

export type CanonicalListingStatus = 'draft' | 'active' | 'paused' | 'sold_out' | 'archived';
export type ProductPolicyClass = 'allowed' | 'restricted' | 'prohibited';
export type RiskSeverity = 'none' | 'low' | 'medium' | 'high' | 'critical';
export type AdminRole = 'super_admin' | 'trust_safety' | 'moderator' | 'institution_moderator' | 'verification_reviewer' | 'support';
export type ModerationCaseKind = 'credential' | 'product' | 'user' | 'chat' | 'possible_scam' | 'prohibited_content' | 'appeal' | 'urgent_incident';

export type AdminPrincipal = {
  uid: string;
  role: AdminRole;
  active: boolean;
  institution_id?: string;
};

export type ModerationCase = {
  id: string;
  kind: ModerationCaseKind;
  institution_id?: string;
  priority: 'normal' | 'high' | 'urgent';
  status: 'open' | 'reviewing' | 'resolved' | 'dismissed';
};

export type ItemPolicyDecision = {
  classification: ProductPolicyClass;
  reasons: string[];
  required_flow?: 'food' | 'housing' | 'rideshare' | 'event-ticket' | 'general';
};

export type SafetySignal = {
  code: string;
  severity: RiskSeverity;
  message: string;
};

export const VERIFICATION_DISCLAIMER = 'La verificación aumenta la certeza de identidad, pero no garantiza el comportamiento o la seguridad de una persona.';

export function canonicalListingStatusFromLegacy(status: string): CanonicalListingStatus {
  if (status === 'Pausado') return 'paused';
  if (status === 'Agotado' || status === 'Vendido') return 'sold_out';
  if (status === 'Archivado') return 'archived';
  // `Reservado` is intentionally treated as active at listing level. Reservation
  // belongs to a transaction, not to the canonical listing lifecycle.
  return 'active';
}

export function canonicalListingCanTransition(from: CanonicalListingStatus, to: CanonicalListingStatus) {
  const allowed: Record<CanonicalListingStatus, CanonicalListingStatus[]> = {
    draft: ['active', 'archived'],
    active: ['paused', 'sold_out', 'archived'],
    paused: ['active', 'archived'],
    sold_out: ['archived'],
    archived: [],
  };
  return allowed[from].includes(to);
}

const prohibitedPatterns: Array<[RegExp, string]> = [
  [/\b(arma|pistola|rifle|munici[oó]n|balas?|explosivo)\b/i, 'weapons'],
  [/\b(coca[ií]na|metanfetamina|fentanilo|lsd|marihuana|thc|droga)\b/i, 'illegal_drugs'],
  [/\b(credencial\s+(ine|in[eé]|universitaria)|pasaporte|acta\s+de\s+nacimiento|documento\s+oficial)\b/i, 'identity_documents'],
  [/\b(cuenta\s+(robada|hackeada)|cuenta\s+streaming|contrase(?:ñ|n)a\s+incluida)\b/i, 'stolen_accounts'],
  [/\b(clon|r[eé]plica\s+1:1|pirata|falsificad[oa])\b/i, 'counterfeit'],
  [/\b(medicamento\s+controlado|receta\s+m[eé]dica|clonazepam|alprazolam|tramadol)\b/i, 'restricted_medicine'],
];

export function classifyMarketplaceItem(input: { category?: ProductCategory | string; title?: string; description?: string }): ItemPolicyDecision {
  const text = `${input.title || ''} ${input.description || ''}`.trim();
  const reasons = prohibitedPatterns.filter(([pattern]) => pattern.test(text)).map(([, code]) => code);
  if (reasons.length) return { classification: 'prohibited', reasons };

  if (input.category === 'Comida' || input.category === 'Postres') {
    return { classification: 'restricted', reasons: ['category_requires_food_disclosures'], required_flow: 'food' };
  }
  if (input.category === 'Cuartos & Renta') {
    return { classification: 'restricted', reasons: ['category_requires_housing_privacy'], required_flow: 'housing' };
  }
  if (input.category === 'Transporte') {
    return { classification: 'restricted', reasons: ['rideshare_only_initially'], required_flow: 'rideshare' };
  }
  if (input.category === 'Eventos' || input.category === 'Entradas permitidas') {
    return { classification: 'restricted', reasons: ['ticket_and_event_rules_apply'], required_flow: 'event-ticket' };
  }
  return { classification: 'allowed', reasons: [], required_flow: 'general' };
}

export function categorySafetyRequirements(category?: ProductCategory | string) {
  if (category === 'Comida' || category === 'Postres') {
    return {
      required: ['ingredients', 'allergens', 'availability'],
      optional: ['preparation_note', 'delivery_window'],
      forbiddenPublic: [] as string[],
    };
  }
  if (category === 'Cuartos & Renta') {
    return {
      required: ['monthly_price', 'deposit', 'included_services', 'approximate_zone', 'campus_distance', 'room_type'],
      optional: ['house_rules'],
      forbiddenPublic: ['exact_address'],
    };
  }
  if (category === 'Transporte') {
    return {
      required: ['origin_zone', 'destination_zone', 'departure_window', 'rideshare_cost_share'],
      optional: ['available_seats'],
      forbiddenPublic: ['driver_license_image', 'home_address'],
    };
  }
  return { required: [] as string[], optional: [] as string[], forbiddenPublic: [] as string[] };
}

export function scanMessageForSafety(text: string): SafetySignal[] {
  const normalized = text.toLowerCase();
  const signals: SafetySignal[] = [];
  if (/\b(c[oó]digo|otp|verification code|c[oó]digo de verificaci[oó]n)\b/.test(normalized)) {
    signals.push({ code: 'otp_request', severity: 'critical', message: 'Nunca compartas códigos de verificación con otra persona.' });
  }
  if (/\b(whatsapp|telegram|sms)\b/.test(normalized) && /\b(paga|dep[oó]sito|transfer|manda|env[ií]a)\b/.test(normalized)) {
    signals.push({ code: 'off_platform_payment', severity: 'high', message: 'Mantén la coordinación y evidencia dentro de TuTop cuando sea posible.' });
  }
  if (/https?:\/\//.test(normalized) || /\bbit\.ly\b|\btinyurl\b|\bt\.me\b/.test(normalized)) {
    signals.push({ code: 'external_link', severity: 'medium', message: 'Revisa con cuidado enlaces externos y no ingreses credenciales desde links enviados por otros usuarios.' });
  }
  if (/\b(anticipo|apartado)\b/.test(normalized) && /\btransfer|dep[oó]sito|spei\b/.test(normalized)) {
    signals.push({ code: 'advance_payment', severity: 'high', message: 'Un anticipo fuera de TuTop puede elevar el riesgo de fraude.' });
  }
  return signals;
}

export function riskSeverity(signals: SafetySignal[]): RiskSeverity {
  const weight: Record<RiskSeverity, number> = { none: 0, low: 1, medium: 2, high: 3, critical: 4 };
  return signals.reduce<RiskSeverity>((max, signal) => weight[signal.severity] > weight[max] ? signal.severity : max, 'none');
}

export function dynamicAccountLimits(input: { verification_level?: VerificationLevel; account_age_days?: number; upheld_reports?: number }) {
  const level = input.verification_level || 0;
  const age = Math.max(0, input.account_age_days || 0);
  const reports = Math.max(0, input.upheld_reports || 0);
  const trusted = level >= 3 && age >= 30 && reports === 0;
  if (trusted) return { active_listings: 100, new_chats_per_hour: 40, offers_per_hour: 30 };
  if (level >= 1 && age >= 7 && reports < 2) return { active_listings: 30, new_chats_per_hour: 15, offers_per_hour: 12 };
  return { active_listings: 8, new_chats_per_hour: 6, offers_per_hour: 5 };
}

export function canModerateCase(admin: AdminPrincipal, item: ModerationCase) {
  if (!admin.active) return false;
  if (admin.role === 'super_admin' || admin.role === 'trust_safety') return true;
  if (admin.role === 'verification_reviewer') return item.kind === 'credential';
  if (admin.role === 'support') return item.kind === 'appeal';
  if (admin.role === 'moderator') return item.kind !== 'credential';
  if (admin.role === 'institution_moderator') {
    return Boolean(admin.institution_id && item.institution_id && admin.institution_id === item.institution_id && item.kind !== 'credential');
  }
  return false;
}

export function recommendedVisibilityScope(category?: ProductCategory | string): ListingVisibilityScope {
  if (['Comida', 'Postres', 'Apuntes & Guías', 'Libros & Apuntes'].includes(String(category))) return 'campus';
  if (['Cuartos & Renta', 'Transporte'].includes(String(category))) return 'university-zone';
  if (['Electrónica', 'Ropa & Accesorios', 'Hogar', 'Videojuegos', 'Coleccionables'].includes(String(category))) return 'city';
  return 'institution';
}
