import type { Product, ProductCategory, User } from '../types';
import { defaultScopeForCategory } from './universityNetwork';

const SYNONYMS: Record<string, string[]> = {
  iphone: ['iphone', 'celular apple', 'telefono apple', 'smartphone apple'],
  celular: ['celular', 'telefono', 'smartphone', 'movil'],
  apuntes: ['apuntes', 'notas', 'guia', 'resumen'],
  microeconomia: ['microeconomia', 'micro', 'economia micro'],
  calculadora: ['calculadora', 'casio', 'cientifica'],
  cuarto: ['cuarto', 'habitacion', 'renta', 'roomie'],
  transporte: ['transporte', 'uber', 'viaje', 'ride', 'aventón', 'aventon'],
};

export type CategoryFilterDefinition = {
  key: string;
  label: string;
  kind: 'text' | 'number' | 'boolean' | 'enum';
  options?: string[];
};

export const CATEGORY_FILTERS: Partial<Record<ProductCategory, CategoryFilterDefinition[]>> = {
  'Electrónica': [
    { key: 'marca', label: 'Marca', kind: 'text' },
    { key: 'modelo', label: 'Modelo', kind: 'text' },
    { key: 'storage_gb', label: 'Almacenamiento', kind: 'number' },
    { key: 'battery_health', label: 'Batería', kind: 'number' },
    { key: 'warranty', label: 'Garantía', kind: 'boolean' },
  ],
  'Ropa & Accesorios': [
    { key: 'talla', label: 'Talla', kind: 'text' },
    { key: 'style', label: 'Estilo', kind: 'text' },
    { key: 'color', label: 'Color', kind: 'text' },
    { key: 'condition', label: 'Estado', kind: 'enum', options: ['Nuevo', 'Como nuevo', 'Buen estado', 'Uso visible'] },
  ],
  'Libros & Apuntes': [
    { key: 'subject', label: 'Materia', kind: 'text' },
    { key: 'career', label: 'Carrera', kind: 'text' },
    { key: 'semester', label: 'Semestre', kind: 'text' },
    { key: 'author', label: 'Autor', kind: 'text' },
    { key: 'edition', label: 'Edición', kind: 'text' },
  ],
  'Apuntes & Guías': [
    { key: 'subject', label: 'Materia', kind: 'text' },
    { key: 'teacher', label: 'Profesor', kind: 'text' },
    { key: 'career', label: 'Carrera', kind: 'text' },
    { key: 'semester', label: 'Semestre', kind: 'text' },
  ],
  'Cuartos & Renta': [
    { key: 'campus_distance_km', label: 'Distancia al campus', kind: 'number' },
    { key: 'monthly_price', label: 'Precio mensual', kind: 'number' },
    { key: 'deposit', label: 'Depósito', kind: 'number' },
    { key: 'services_included', label: 'Servicios', kind: 'text' },
  ],
  'Comida': [
    { key: 'available_now', label: 'Disponible', kind: 'boolean' },
    { key: 'schedule', label: 'Horario', kind: 'text' },
    { key: 'delivery', label: 'Entrega', kind: 'boolean' },
    { key: 'allergens', label: 'Alérgenos', kind: 'text' },
  ],
};

export function normalizeNationalSearch(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/([a-z])([0-9])/g, '$1 $2')
    .replace(/([0-9])([a-z])/g, '$1 $2')
    .replace(/[^a-z0-9ñ]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function expandedSearchTokens(query: string) {
  const normalized = normalizeNationalSearch(query);
  const tokens = new Set(normalized.split(' ').filter(Boolean));
  for (const [canonical, variants] of Object.entries(SYNONYMS)) {
    if (variants.some((variant) => normalized.includes(normalizeNationalSearch(variant)))) {
      tokens.add(canonical);
      variants.forEach((variant) => normalizeNationalSearch(variant).split(' ').forEach((token) => tokens.add(token)));
    }
  }
  return [...tokens];
}

function productText(product: Product) {
  return normalizeNationalSearch([
    product.titulo,
    product.descripcion,
    product.categoria,
    product.subcategoria,
    product.marca,
    product.modelo,
    product.facultad,
    product.city_name,
    ...(product.etiquetas || []),
    ...Object.entries(product.attributes || {}).flatMap(([key, value]) => [key, Array.isArray(value) ? value.join(' ') : String(value)]),
  ].filter(Boolean).join(' '));
}

function scopeAffinity(product: Product, user: User) {
  const userInstitution = user.institution_id || user.university?.institution_id;
  const userCampus = user.campus_id || user.university?.campus_id;
  const userCity = user.university?.city_id;
  if (userCampus && product.campus_id === userCampus) return { score: 30, reason: 'Publicado en tu campus' };
  if (userInstitution && product.institution_id === userInstitution) return { score: 20, reason: 'Publicado en tu universidad' };
  if (userCity && product.city_id === userCity) return { score: 10, reason: 'Publicado en tu ciudad' };
  if ((product.visibility_scope || defaultScopeForCategory(product.categoria)) === 'national') return { score: 2, reason: 'Disponible para todo México' };
  return { score: 0, reason: '' };
}

export function searchScore(product: Product, input: { query?: string; user: User; interestCategories?: string[]; now?: number }) {
  const tokens = expandedSearchTokens(input.query || '');
  const haystack = productText(product);
  let score = 0;
  const reasons: string[] = [];
  if (tokens.length) {
    const matched = tokens.filter((token) => haystack.includes(token));
    if (matched.length !== tokens.length) return { score: -Infinity, reasons: [] as string[] };
    score += matched.length * 12;
    reasons.push('Coincide con tu búsqueda');
  }

  const proximity = scopeAffinity(product, input.user);
  score += proximity.score;
  if (proximity.reason) reasons.push(proximity.reason);

  const normalizedCategory = normalizeNationalSearch(product.categoria);
  if ((input.interestCategories || []).some((category) => normalizeNationalSearch(category) === normalizedCategory)) {
    score += 8;
    reasons.push(`Porque te interesa ${product.categoria}`);
  }

  const created = Date.parse(product.fecha_creacion);
  const ageDays = Number.isFinite(created) ? Math.max(0, ((input.now ?? Date.now()) - created) / 86400000) : 365;
  score += Math.max(0, 10 - ageDays / 3);
  if (ageDays <= 2) reasons.push('Publicado recientemente');

  if (product.vendedor_verificado) {
    score += 4;
    reasons.push('Vendedor verificado');
  }
  if (product.es_top) score += 2;
  score += Math.min(5, Math.log2((product.likes || 0) + 1));

  return { score, reasons: [...new Set(reasons)].slice(0, 3) };
}

export function rankNationalSearch(products: Product[], input: { query?: string; user: User; interestCategories?: string[]; now?: number }) {
  return products
    .map((product) => ({ product, ...searchScore(product, input) }))
    .filter((item) => Number.isFinite(item.score))
    .sort((a, b) => b.score - a.score || Date.parse(b.product.fecha_creacion) - Date.parse(a.product.fecha_creacion));
}
