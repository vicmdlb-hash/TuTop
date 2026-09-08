type CostCutoverFlag = 'VITE_TUTOP_V2_REVIEWS_LAZY_CUTOVER' | 'VITE_TUTOP_V2_WALLET_LAZY_CUTOVER' | 'VITE_TUTOP_V2_FAVORITES_VISIBLE_CUTOVER';

function enabled(name: CostCutoverFlag) {
  const schemaV2 = String(import.meta.env.VITE_TUTOP_SCHEMA_V2 || '').toLowerCase() === 'true';
  const environment = String(import.meta.env.VITE_TUTOP_ENVIRONMENT || '').trim().toLowerCase();
  const requested = String(import.meta.env[name] || '').trim().toLowerCase() === 'true';
  if (!requested) return false;
  if (!schemaV2) throw new Error('V2_COST_CUTOVER_REQUIRES_SCHEMA_V2');
  if (environment !== 'staging') throw new Error('V2_COST_CUTOVER_STAGING_ONLY');
  return true;
}

export function reviewsLazyCutoverEnabled() {
  return enabled('VITE_TUTOP_V2_REVIEWS_LAZY_CUTOVER');
}

export function walletLazyCutoverEnabled() {
  return enabled('VITE_TUTOP_V2_WALLET_LAZY_CUTOVER');
}

export function favoritesVisibleCutoverEnabled() {
  return enabled('VITE_TUTOP_V2_FAVORITES_VISIBLE_CUTOVER');
}
