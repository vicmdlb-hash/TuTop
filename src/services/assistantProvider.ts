import { cleanTitle, detectCategory, extractPrice, improveDescription, isForbiddenProductText, MARKETPLACE_CATEGORIES, reviewProductDraft, suggestPriceFromProducts } from '../lib/productAssistant';
import { detectDeliveryIntent, detectListingCondition, detectNegotiableIntent, detectVisibilityIntent } from '../lib/publishAssistant';
import type { ListingDeliveryMethod } from '../lib/listingSchemaV2';
import type { ListingVisibilityScope, Product, ProductCategory, ProductCondition, ProductFormData } from '../types';

export const TOPI_PERSONA = {
  name: 'Topi',
  role: 'asistente de TuTop para comprar y vender entre estudiantes en México',
  principles: [
    'TuTop facilita descubrimiento, conversación y acuerdos; no opera envíos ni paquetería.',
    'Prioriza encuentros locales, campus, lugares públicos y cercanía.',
    'Nunca inventa precio, condición, identidad, ubicación exacta ni datos obligatorios.',
    'Nunca publica ni compra por el usuario: propone y el usuario confirma.',
    'Bloquea productos prohibidos y evita compartir domicilio, tokens o datos sensibles.',
    'Responde breve, claro y en español de México.',
  ],
} as const;

export interface CopilotContext {
  draft: Partial<ProductFormData>;
  products: Product[];
  prompt?: string;
}

export interface TopiComposeSuggestion {
  title?: string;
  category?: ProductCategory;
  condition?: ProductCondition;
  price?: number;
  negotiable?: boolean;
  visibilityScope?: ListingVisibilityScope;
  deliveryMethods?: ListingDeliveryMethod[];
  description?: string;
}

export interface CopilotResult {
  category?: ProductCategory;
  description?: string;
  priceSuggestion?: { low: number; high: number; median: number; samples: number } | null;
  issues?: string[];
  compose?: TopiComposeSuggestion;
  source: 'local' | 'topi-endpoint';
}

export type TopiAction = 'category' | 'description' | 'price' | 'review' | 'compose';

const VALID_CONDITIONS: ProductCondition[] = ['Nuevo', 'Como nuevo', 'Buen estado', 'Uso visible', 'Para reparar', 'No aplica'];
const VALID_SCOPES: ListingVisibilityScope[] = ['campus', 'institution', 'university-zone', 'city', 'national'];
const VALID_DELIVERY: ListingDeliveryMethod[] = ['campus_meetup', 'pickup', 'local_delivery', 'shipping'];

function safeText(value: unknown, max: number) {
  if (typeof value !== 'string') return undefined;
  const text = value.replace(/\u0000/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
  return text || undefined;
}

function validCategory(value: unknown): ProductCategory | undefined {
  return typeof value === 'string' && MARKETPLACE_CATEGORIES.includes(value as ProductCategory)
    ? value as ProductCategory
    : undefined;
}

function safeDraftForRemote(draft: Partial<ProductFormData>) {
  return {
    titulo: safeText(draft.titulo, 120),
    descripcion: safeText(draft.descripcion, 1200),
    precio_mxn: typeof draft.precio_mxn === 'number' && Number.isFinite(draft.precio_mxn) ? draft.precio_mxn : undefined,
    categoria: validCategory(draft.categoria),
    condicion: VALID_CONDITIONS.includes(draft.condicion as ProductCondition) ? draft.condicion : undefined,
    precio_negociable: typeof draft.precio_negociable === 'boolean' ? draft.precio_negociable : undefined,
    visibility_scope: VALID_SCOPES.includes(draft.visibility_scope as ListingVisibilityScope) ? draft.visibility_scope : undefined,
  };
}

function sanitizeCompose(raw: unknown, context: CopilotContext): TopiComposeSuggestion | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const value = raw as Record<string, unknown>;
  const title = safeText(value.title, 120);
  const description = safeText(value.description, 1200);
  const category = validCategory(value.category);
  const condition = VALID_CONDITIONS.includes(value.condition as ProductCondition) ? value.condition as ProductCondition : undefined;
  const priceValue = Number(value.price);
  const price = Number.isFinite(priceValue) && priceValue > 0 && priceValue <= 1_000_000 ? Math.round(priceValue * 100) / 100 : undefined;
  const negotiable = typeof value.negotiable === 'boolean' ? value.negotiable : undefined;
  const visibilityScope = VALID_SCOPES.includes(value.visibilityScope as ListingVisibilityScope)
    ? value.visibilityScope as ListingVisibilityScope
    : undefined;

  const explicitShipping = detectDeliveryIntent(String(context.prompt || '')).includes('shipping');
  const rawMethods = Array.isArray(value.deliveryMethods) ? value.deliveryMethods : [];
  const deliveryMethods = [...new Set(rawMethods
    .filter((method): method is ListingDeliveryMethod => VALID_DELIVERY.includes(method as ListingDeliveryMethod))
    .filter((method) => method !== 'shipping' || explicitShipping))];

  if (isForbiddenProductText(`${title || ''} ${description || ''}`)) return undefined;
  const suggestion: TopiComposeSuggestion = {
    title,
    category,
    condition,
    price,
    negotiable,
    visibilityScope,
    deliveryMethods: deliveryMethods.length ? deliveryMethods : undefined,
    description,
  };
  return Object.values(suggestion).some((item) => item !== undefined) ? suggestion : undefined;
}

function sanitizeRemoteResult(action: TopiAction, raw: unknown, context: CopilotContext): CopilotResult | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  const result: CopilotResult = { source: 'topi-endpoint' };

  const category = validCategory(value.category);
  if (category) result.category = category;

  const description = safeText(value.description, 1200);
  if (description && !isForbiddenProductText(description)) result.description = description;

  if (value.priceSuggestion && typeof value.priceSuggestion === 'object') {
    const price = value.priceSuggestion as Record<string, unknown>;
    const low = Number(price.low);
    const high = Number(price.high);
    const median = Number(price.median);
    const samples = Math.round(Number(price.samples));
    if ([low, high, median].every((item) => Number.isFinite(item) && item >= 0 && item <= 1_000_000)
      && Number.isFinite(samples) && samples >= 1 && samples <= 500
      && low <= median && median <= high) {
      result.priceSuggestion = { low, high, median, samples };
    }
  }

  if (Array.isArray(value.issues)) {
    const issues = value.issues.map((item) => safeText(item, 180)).filter((item): item is string => Boolean(item)).slice(0, 6);
    if (issues.length) result.issues = issues;
  }

  if (action === 'compose') result.compose = sanitizeCompose(value.compose, context);
  const hasPayload = Boolean(result.category || result.description || result.priceSuggestion || result.issues?.length || result.compose);
  return hasPayload ? result : null;
}

function localTopi(action: TopiAction, context: CopilotContext): CopilotResult {
  const prompt = String(context.prompt || '').trim();
  const text = prompt || `${context.draft.titulo || ''} ${context.draft.descripcion || ''}`;
  if (action === 'category') return { category: detectCategory(text) || undefined, source: 'local' };
  if (action === 'description') return { description: improveDescription(context.draft), source: 'local' };
  if (action === 'price') return { priceSuggestion: suggestPriceFromProducts(context.draft, context.products), source: 'local' };
  if (action === 'review') return { issues: reviewProductDraft(context.draft), source: 'local' };

  const category = detectCategory(text) || undefined;
  const extractedPrice = extractPrice(text);
  const title = cleanTitle(text) || text.slice(0, 90);
  const inferredDelivery = detectDeliveryIntent(text);
  return {
    source: 'local',
    compose: {
      title,
      category,
      price: extractedPrice && extractedPrice > 0 ? extractedPrice : undefined,
      condition: detectListingCondition(text) as ProductCondition | undefined,
      negotiable: detectNegotiableIntent(text),
      visibilityScope: detectVisibilityIntent(text),
      deliveryMethods: [...new Set(inferredDelivery)],
      description: text.length > title.length + 8
        ? text.slice(0, 900)
        : improveDescription({ titulo: title, categoria: category, descripcion: '' }),
    },
  };
}

function topiEndpoint() {
  const enabled = String(import.meta.env.VITE_TUTOP_TOPI_REMOTE_ENABLED || '').toLowerCase() === 'true';
  const endpoint = String(import.meta.env.VITE_TUTOP_TOPI_ENDPOINT || '').trim();
  return enabled && /^https:\/\//i.test(endpoint) ? endpoint : '';
}

async function askConfiguredTopi(action: TopiAction, context: CopilotContext): Promise<CopilotResult | null> {
  const endpoint = topiEndpoint();
  if (!endpoint) return null;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 6500);
  try {
    // IMPORTANT: this request intentionally carries NO provider API key. The
    // configured URL must be a TuTop-controlled backend proxy that owns secrets,
    // rate limits, moderation and cost controls server-side.
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        assistant: TOPI_PERSONA,
        action,
        prompt: String(context.prompt || '').slice(0, 1200),
        draft: safeDraftForRemote(context.draft),
        comparable_products: context.products.slice(0, 24).map((product) => ({
          title: product.titulo,
          category: product.categoria,
          price_mxn: product.precio_mxn,
          condition: product.condicion,
          city_id: product.city_id,
          campus_id: product.campus_id,
        })),
      }),
    });
    if (!response.ok) return null;
    return sanitizeRemoteResult(action, await response.json(), context);
  } catch { return null; }
  finally { window.clearTimeout(timer); }
}

/**
 * Topi is local-first and zero-cost by default. A future/private AI model can be
 * attached through VITE_TUTOP_TOPI_ENDPOINT, but client builds never receive the
 * provider secret. Any endpoint failure falls back to deterministic local Topi.
 */
export async function askTopi(action: TopiAction, context: CopilotContext): Promise<CopilotResult> {
  const remote = await askConfiguredTopi(action, context);
  return remote || localTopi(action, context);
}
