import { detectCategory, improveDescription, reviewProductDraft, suggestPriceFromProducts } from '../lib/productAssistant';
import type { Product, ProductCategory, ProductFormData } from '../types';

export interface CopilotContext {
  draft: Partial<ProductFormData>;
  products: Product[];
}

export interface CopilotResult {
  category?: ProductCategory;
  description?: string;
  priceSuggestion?: { low: number; high: number; median: number; samples: number } | null;
  issues?: string[];
  source: 'local' | 'remote';
}

const endpoint = import.meta.env.VITE_TUTOP_AI_ENDPOINT?.trim();

async function remoteCopilot(action: string, context: CopilotContext): Promise<CopilotResult | null> {
  if (!endpoint) return null;
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action,
        draft: context.draft,
        // Only aggregate/public-ish marketplace context is sent. Never send phone/auth data.
        comparables: context.products.slice(0, 40).map((product) => ({
          titulo: product.titulo,
          categoria: product.categoria,
          precio_mxn: product.precio_mxn,
          estado: product.estado,
        })),
      }),
    });
    if (!response.ok) return null;
    const data = await response.json() as Partial<CopilotResult>;
    return { ...data, source: 'remote' } as CopilotResult;
  } catch {
    return null;
  }
}

export async function askTopi(action: 'category' | 'description' | 'price' | 'review', context: CopilotContext): Promise<CopilotResult> {
  const remote = await remoteCopilot(action, context);
  if (remote) return remote;

  const text = `${context.draft.titulo || ''} ${context.draft.descripcion || ''}`;
  return {
    category: detectCategory(text) || undefined,
    description: improveDescription(context.draft),
    priceSuggestion: suggestPriceFromProducts(context.draft, context.products),
    issues: reviewProductDraft(context.draft),
    source: 'local',
  };
}
