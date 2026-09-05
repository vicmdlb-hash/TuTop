import type { Product } from '../types';
import { normalizeNationalSearch } from './nationalSearch';

export type PricingEvidence = {
  sample_size: number;
  median_mxn: number;
  frequent_low_mxn: number;
  frequent_high_mxn: number;
  sell_fast_mxn: number;
  recommended_mxn: number;
  try_high_mxn: number;
  scope: 'campus' | 'institution' | 'city' | 'national';
};

function percentile(sorted: number[], p: number) {
  if (!sorted.length) return 0;
  const index = (sorted.length - 1) * p;
  const low = Math.floor(index);
  const high = Math.ceil(index);
  if (low === high) return sorted[low];
  return sorted[low] + (sorted[high] - sorted[low]) * (index - low);
}

function roundPrice(value: number) {
  if (value < 100) return Math.round(value / 5) * 5;
  if (value < 1000) return Math.round(value / 10) * 10;
  return Math.round(value / 50) * 50;
}

function comparableScore(target: Product, candidate: Product) {
  if (target.id === candidate.id || candidate.estado !== 'Activo') return -1;
  if (target.categoria !== candidate.categoria) return -1;
  let score = 1;
  if (target.marca && candidate.marca && normalizeNationalSearch(target.marca) === normalizeNationalSearch(candidate.marca)) score += 3;
  if (target.modelo && candidate.modelo && normalizeNationalSearch(target.modelo) === normalizeNationalSearch(candidate.modelo)) score += 5;
  if (target.subcategoria && candidate.subcategoria && normalizeNationalSearch(target.subcategoria) === normalizeNationalSearch(candidate.subcategoria)) score += 2;
  if (target.institution_id && target.institution_id === candidate.institution_id) score += 2;
  if (target.city_id && target.city_id === candidate.city_id) score += 1;
  return score;
}

export function smartPriceFromTuTop(target: Product, inventory: Product[], minSample = 5): PricingEvidence | null {
  const comparables = inventory
    .map((candidate) => ({ candidate, score: comparableScore(target, candidate) }))
    .filter((item) => item.score >= 1 && item.candidate.precio_mxn > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 40)
    .map((item) => item.candidate);

  if (comparables.length < minSample) return null;
  const prices = comparables.map((item) => item.precio_mxn).sort((a, b) => a - b);
  const median = percentile(prices, 0.5);
  const q25 = percentile(prices, 0.25);
  const q75 = percentile(prices, 0.75);
  const scope = target.campus_id && comparables.filter((p) => p.campus_id === target.campus_id).length >= minSample
    ? 'campus'
    : target.institution_id && comparables.filter((p) => p.institution_id === target.institution_id).length >= minSample
      ? 'institution'
      : target.city_id && comparables.filter((p) => p.city_id === target.city_id).length >= minSample
        ? 'city'
        : 'national';

  return {
    sample_size: comparables.length,
    median_mxn: roundPrice(median),
    frequent_low_mxn: roundPrice(q25),
    frequent_high_mxn: roundPrice(q75),
    sell_fast_mxn: roundPrice(Math.max(q25, median * 0.92)),
    recommended_mxn: roundPrice(median),
    try_high_mxn: roundPrice(Math.min(q75, median * 1.1)),
    scope,
  };
}

export function smartPriceMessage(evidence: PricingEvidence | null) {
  if (!evidence) return 'Todavía no hay suficientes comparables reales en TuTop para recomendar un precio.';
  return `Hay ${evidence.sample_size} comparables útiles. Mediana $${evidence.median_mxn.toLocaleString('es-MX')} MXN · rango frecuente $${evidence.frequent_low_mxn.toLocaleString('es-MX')}–$${evidence.frequent_high_mxn.toLocaleString('es-MX')}.`;
}
