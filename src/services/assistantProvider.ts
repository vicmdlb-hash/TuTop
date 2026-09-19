import { cleanTitle, detectCategory, extractPrice, improveDescription, isForbiddenProductText, MARKETPLACE_CATEGORIES, reviewProductDraft, suggestPriceFromProducts } from '../lib/productAssistant';
import { detectDeliveryIntent, detectListingCondition, detectNegotiableIntent, detectVisibilityIntent } from '../lib/publishAssistant';
import type { ListingDeliveryMethod } from '../lib/listingSchemaV2';
import type { ListingVisibilityScope, Product, ProductCategory, ProductCondition, ProductFormData } from '../types';
import { redactTopiRemoteText, type TopiPrivacyRedaction } from '../lib/topiPrivacy';
import { sanitizeTopiStructuredAttributes } from '../lib/topiStructuredAttributes';
import { nationalFieldsFor } from '../lib/nationalListingFields';
import { generateNativeTopiText, nativeTopiAIStatus } from './nativeTopiAI';

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
  attributes?: Record<string, string | number | boolean>;
}

// Keep component compatibility while exposing which connected provider actually answered.
export type TopiSource = 'local' | 'topi-endpoint';
export type TopiProvider = 'firebase-ai-logic' | 'private-endpoint';

export interface CopilotResult {
  category?: ProductCategory;
  description?: string;
  priceSuggestion?: { low: number; high: number; median: number; samples: number } | null;
  issues?: string[];
  compose?: TopiComposeSuggestion;
  source: TopiSource;
  provider?: TopiProvider;
  privacyRedactions?: TopiPrivacyRedaction[];
}

export type TopiAction = 'category' | 'description' | 'price' | 'review' | 'compose';

const VALID_CONDITIONS: ProductCondition[] = ['Nuevo', 'Como nuevo', 'Buen estado', 'Uso visible', 'Para reparar', 'No aplica'];
const VALID_SCOPES: ListingVisibilityScope[] = ['campus', 'institution', 'university-zone', 'city', 'national'];
const VALID_DELIVERY: ListingDeliveryMethod[] = ['campus_meetup', 'pickup', 'local_delivery', 'shipping'];

function physicalQaRequiresRealAI() {
  const environment = String(import.meta.env.VITE_TUTOP_ENVIRONMENT || '').trim().toLowerCase();
  const version = String(import.meta.env.VITE_TUTOP_APP_VERSION || '').trim();
  return environment === 'staging' && /^0\.9\.2-beta\./.test(version);
}

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
    titulo: redactTopiRemoteText(draft.titulo, 120).text,
    descripcion: redactTopiRemoteText(draft.descripcion, 1200).text,
    precio_mxn: typeof draft.precio_mxn === 'number' && Number.isFinite(draft.precio_mxn) ? draft.precio_mxn : undefined,
    categoria: validCategory(draft.categoria),
    condicion: VALID_CONDITIONS.includes(draft.condicion as ProductCondition) ? draft.condicion : undefined,
    precio_negociable: typeof draft.precio_negociable === 'boolean' ? draft.precio_negociable : undefined,
    visibility_scope: VALID_SCOPES.includes(draft.visibility_scope as ListingVisibilityScope) ? draft.visibility_scope : undefined,
  };
}

function safeComparables(products: Product[]) {
  return products.slice(0, 24).map((product) => ({
    title: redactTopiRemoteText(product.titulo, 120).text,
    category: product.categoria,
    price_mxn: Number(product.precio_mxn),
    condition: product.condicion,
  }));
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

  const structuredCategory = category
    || validCategory(context.draft.categoria)
    || detectCategory(String(context.prompt || ''))
    || undefined;
  const attributes = sanitizeTopiStructuredAttributes(value.attributes, structuredCategory, String(context.prompt || ''));

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
    attributes,
  };
  return Object.values(suggestion).some((item) => item !== undefined) ? suggestion : undefined;
}

function sanitizeRemoteResult(action: TopiAction, raw: unknown, context: CopilotContext, provider: TopiProvider): CopilotResult | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  const result: CopilotResult = { source: 'topi-endpoint', provider };

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
      && low <= median && median <= high) result.priceSuggestion = { low, high, median, samples };
  }

  if (Array.isArray(value.issues)) {
    const issues = value.issues.map((item) => safeText(item, 180)).filter((item): item is string => Boolean(item)).slice(0, 6);
    if (issues.length) result.issues = issues;
  }

  if (action === 'compose') result.compose = sanitizeCompose(value.compose ?? value, context);
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

function remotePrivacyContext(context: CopilotContext) {
  const prompt = redactTopiRemoteText(context.prompt, 1200);
  const title = redactTopiRemoteText(context.draft.titulo, 120);
  const description = redactTopiRemoteText(context.draft.descripcion, 1200);
  return {
    prompt: prompt.text,
    redactions: [...new Set([...prompt.redactions, ...title.redactions, ...description.redactions])],
  };
}

function nativePrompt(action: TopiAction, context: CopilotContext, userPrompt?: string) {
  const categoryHint = validCategory(context.draft.categoria)
    || detectCategory(String(context.prompt || ''))
    || undefined;
  const structuredFields = nationalFieldsFor(categoryHint).map((field) => ({
    key: field.key,
    kind: field.kind || 'text',
    required: field.required === true,
  }));
  const payload = {
    action,
    user_prompt: userPrompt,
    draft: safeDraftForRemote(context.draft),
    structured_fields: structuredFields,
    comparable_products: action === 'price' || action === 'compose' ? safeComparables(context.products) : [],
  };
  return [
    'Eres Topi, asistente de TuTop para un marketplace universitario en México.',
    'Responde SOLO JSON válido, sin markdown, sin explicaciones fuera del JSON.',
    'Nunca inventes identidad, dirección, ubicación exacta, stock, marca, condición ni precio que no pueda inferirse razonablemente.',
    'Nunca propongas artículos prohibidos. TuTop no opera envíos; shipping sólo puede aparecer si el usuario lo pidió explícitamente.',
    `Categorías válidas: ${MARKETPLACE_CATEGORIES.join(' | ')}`,
    `Condiciones válidas: ${VALID_CONDITIONS.join(' | ')}`,
    `Alcances válidos: ${VALID_SCOPES.join(' | ')}`,
    'Para compose usa {"compose":{"title":string?,"category":string?,"condition":string?,"price":number?,"negotiable":boolean?,"visibilityScope":string?,"deliveryMethods":string[]?,"description":string?,"attributes":object?}}.',
    'attributes sólo puede usar structured_fields y sólo cuando el usuario dio evidencia explícita. Nunca inventes alérgenos, dirección/zona, marca, modelo, disponibilidad ni datos obligatorios.',
    'Para category usa {"category":string}; description usa {"description":string}; review usa {"issues":string[]}; price usa {"priceSuggestion":{"low":number,"high":number,"median":number,"samples":number}} sólo si hay comparables reales suficientes.',
    `ENTRADA_SEGURA=${JSON.stringify(payload)}`,
  ].join('\n').slice(0, 6000);
}

function parseModelJson(text: string) {
  const clean = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  const start = clean.indexOf('{');
  const end = clean.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(clean.slice(start, end + 1)) as unknown; } catch { return null; }
}

async function askNativeFirebaseTopi(action: TopiAction, context: CopilotContext): Promise<CopilotResult | null> {
  const privacy = remotePrivacyContext(context);
  const generated = await generateNativeTopiText(nativePrompt(action, context, privacy.prompt));
  if (!generated) return null;
  const result = sanitizeRemoteResult(action, parseModelJson(generated.text), context, 'firebase-ai-logic');
  if (result && privacy.redactions.length) result.privacyRedactions = privacy.redactions;
  return result;
}

function topiEndpoint() {
  const enabled = String(import.meta.env.VITE_TUTOP_TOPI_REMOTE_ENABLED || '').toLowerCase() === 'true';
  const endpoint = String(import.meta.env.VITE_TUTOP_TOPI_ENDPOINT || '').trim();
  return enabled && /^https:\/\//i.test(endpoint) ? endpoint : '';
}

async function askConfiguredTopi(action: TopiAction, context: CopilotContext): Promise<CopilotResult | null> {
  const endpoint = topiEndpoint();
  if (!endpoint) return null;
  const privacy = remotePrivacyContext(context);
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 6500);
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        assistant: TOPI_PERSONA,
        action,
        prompt: privacy.prompt,
        draft: safeDraftForRemote(context.draft),
        comparable_products: safeComparables(context.products),
      }),
    });
    if (!response.ok) return null;
    const result = sanitizeRemoteResult(action, await response.json(), context, 'private-endpoint');
    if (result && privacy.redactions.length) result.privacyRedactions = privacy.redactions;
    return result;
  } catch { return null; }
  finally { window.clearTimeout(timer); }
}

/**
 * Topi cascade: native Firebase AI Logic when explicitly enabled, optional
 * private HTTPS endpoint, then deterministic local Topi outside physical QA.
 * The 0.9.2 staging APK deliberately refuses to disguise an AI outage as a
 * successful local answer: physical QA must prove Firebase AI itself.
 */
export async function askTopi(action: TopiAction, context: CopilotContext): Promise<CopilotResult> {
  const native = await askNativeFirebaseTopi(action, context);
  if (native) return native;
  const remote = await askConfiguredTopi(action, context);
  if (remote) return remote;
  if (physicalQaRequiresRealAI()) {
    throw new Error(`TOPI_REAL_AI_UNAVAILABLE:${nativeTopiAIStatus().reason}`);
  }
  return localTopi(action, context);
}