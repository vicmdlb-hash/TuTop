import type { Product, SavedSearch } from '../types';

function normalize(value?: string) {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export type SavedSearchNotificationDecision = {
  eligible: boolean;
  reason: string;
};

export function savedSearchNotificationDecision(search: SavedSearch, product: Product): SavedSearchNotificationDecision {
  if (!search.notifications_enabled) return { eligible: false, reason: 'notifications_disabled' };
  if (product.estado !== 'Activo') return { eligible: false, reason: 'listing_not_active' };
  if (search.category && product.categoria !== search.category) return { eligible: false, reason: 'category_mismatch' };
  if (typeof search.max_price_mxn === 'number' && product.precio_mxn > search.max_price_mxn) return { eligible: false, reason: 'price_above_limit' };

  const query = normalize(search.query);
  if (query) {
    const haystack = normalize(`${product.titulo} ${product.descripcion || ''} ${product.categoria} ${product.marca || ''} ${product.modelo || ''}`);
    const terms = query.split(/\s+/).filter(Boolean);
    if (!terms.every((term) => haystack.includes(term))) return { eligible: false, reason: 'query_mismatch' };
  }

  if (search.campus_id && product.campus_id !== search.campus_id) return { eligible: false, reason: 'campus_mismatch' };
  if (!search.campus_id && search.institution_id && product.institution_id !== search.institution_id) return { eligible: false, reason: 'institution_mismatch' };

  if (search.visibility_scope === 'campus' && (!search.campus_id || product.campus_id !== search.campus_id)) {
    return { eligible: false, reason: 'scope_campus_mismatch' };
  }
  if (search.visibility_scope === 'institution' && (!search.institution_id || product.institution_id !== search.institution_id)) {
    return { eligible: false, reason: 'scope_institution_mismatch' };
  }
  if (search.visibility_scope === 'national' && product.visibility_scope !== 'national') {
    return { eligible: false, reason: 'scope_national_mismatch' };
  }

  return { eligible: true, reason: 'matched' };
}
