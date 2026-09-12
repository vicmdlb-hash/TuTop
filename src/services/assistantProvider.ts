import { cleanTitle, detectCategory, extractPrice, improveDescription, reviewProductDraft, suggestPriceFromProducts } from '../lib/productAssistant';
import { detectDeliveryIntent, detectListingCondition, detectNegotiableIntent, detectVisibilityIntent } from '../lib/publishAssistant';
import type { DeliveryMethod, ListingVisibilityScope, Product, ProductCategory, ProductCondition, ProductFormData } from '../types';

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
  deliveryMethods?: DeliveryMethod[];
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

function localTopi(action: TopiAction, context: CopilotContext): CopilotResult {
  const prompt = String(context.prompt || '').trim();
  const text = prompt || `${context.draft.titulo || ''} ${context.draft.descripcion || ''}`;
  if (action === 'category') return { category: detectCategory(text) || undefined, source: 'local' };
  if (action === 'description') return { description: improveDescription(context.draft), source: 'local' };
  if (action === 'price') return { priceSuggestion: suggestPriceFromProducts(context.draft, context.products), source: 'local' };
  if (action === 'review') return { issues: reviewProductDraft(context.draft), source: 'local' };

  const category = detectCategory(text) || undefined;
  const extractedPrice = extractPrice(text);
  const inferredDelivery = detectDeliveryIntent(text)
    .filter((method) => method !== 'shipping')
    .map((method) => method === 'campus_meetup' ? 'Punto TuTop'
      : method === 'pickup' ? 'Recoge conmigo'
        : method === 'local_delivery' ? 'Acordamos por chat'
          : 'Acordamos por chat') as DeliveryMethod[];
  const title = cleanTitle(text) || text.slice(0, 90);
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
        draft: context.draft,
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
    const value = await response.json() as Partial<CopilotResult>;
    if (!value || typeof value !== 'object') return null;
    return { ...value, source: 'topi-endpoint' } as CopilotResult;
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
