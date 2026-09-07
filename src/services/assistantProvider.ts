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
  source: 'local';
}

/**
 * TuTop 0.9 keeps Topi deterministic, local and zero-cost.
 * Remote/generative providers are intentionally out of scope until a future
 * backend proxy, privacy review, rate limits and explicit billing approval exist.
 */
export async function askTopi(action: 'category' | 'description' | 'price' | 'review', context: CopilotContext): Promise<CopilotResult> {
  const text = `${context.draft.titulo || ''} ${context.draft.descripcion || ''}`;

  if (action === 'category') {
    return { category: detectCategory(text) || undefined, source: 'local' };
  }
  if (action === 'description') {
    return { description: improveDescription(context.draft), source: 'local' };
  }
  if (action === 'price') {
    return { priceSuggestion: suggestPriceFromProducts(context.draft, context.products), source: 'local' };
  }
  return { issues: reviewProductDraft(context.draft), source: 'local' };
}
