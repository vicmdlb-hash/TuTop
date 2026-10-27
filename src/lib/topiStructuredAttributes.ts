import { nationalFieldsFor } from './nationalListingFields.ts';
import type { ProductCategory } from '../types/index.ts';

function normalized(value: unknown) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function safeText(value: unknown, max = 300) {
  if (typeof value !== 'string') return undefined;
  const text = value.replace(/\u0000/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
  return text || undefined;
}

// Suggested structured facts must be traceable to words or numbers supplied
// by the seller. Unknown fields remain for manual entry, never AI autofill.
function groundedInSellerPrompt(value: string | number, prompt: string) {
  const sellerTerms = new Set(normalized(prompt).split(/[^a-z0-9]+/).filter(Boolean));
  const proposedTerms = normalized(String(value)).split(/[^a-z0-9]+/).filter((term) => term.length > 1);
  return proposedTerms.length > 0 && proposedTerms.every((term) => sellerTerms.has(term));
}

function supportedWarranty(value: boolean, prompt: string) {
  const text = normalized(prompt);
  const denied = /\b(?:sin garantia|no (?:tiene|incluye|cuenta con) garantia|garantia vencida)\b/.test(text);
  const affirmed = /\b(?:con garantia|tiene garantia|incluye garantia|garantia vigente)\b/.test(text);
  return value ? affirmed && !denied : denied && !affirmed;
}

function containsContactOrSecret(text: string) {
  return /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text)
    || /(?<!\d)(?:\d[\s().-]?){9}\d(?!\d)/.test(text)
    || /\b(?:otp|c[oó]digo|token|contrase(?:ñ|n)a|password|pin)\b\s*[:=-]?\s*[A-Z0-9-]{4,}/i.test(text);
}

function looksExactAddress(text: string) {
  const clean = normalized(text);
  if (/\b(?:calle|avenida|av\.?|boulevard|blvd|carretera|privada|numero|num\.?|#)\b[^\n]{0,60}\b\d{1,6}\b/i.test(clean)) return true;
  // A street name and house number can appear without "calle" (e.g. "zona Reforma 123").
  // Keep coarse distance labels like "zona centro, a 10 min" and numbered neighborhoods.
  const withoutDistances = clean
    .replace(/\b\d+(?:[.,]\d+)?\s*(?:min(?:utos?)?|km|metros?|m)\b/g, ' ')
    .replace(/\b\d{1,2}:\d{2}\b/g, ' ');
  return /\b(?!(?:zona|colonia|barrio|sector|a|de|del|el|la)\b)[a-z][a-z.-]*(?:\s+[a-z][a-z.-]*){0,5}\s+#?\d{1,6}\b/.test(withoutDistances);
}

function explicitZoneEvidence(prompt: string) {
  return /\b(?:zona|colonia|cerca|frente|alrededor|centro|campus|facultad|a\s+\d{1,3}\s*(?:min|minutos|km))\b/i.test(normalized(prompt));
}

function explicitAllergenEvidence(prompt: string) {
  return /\b(?:alergen(?:o|os)?|contiene|sin\s+(?:gluten|lactosa|nuez|nueces|cacahuate|cacahuates|huevo|huevos|leche|soya|soja)|no\s+(?:contiene|tiene)\s+alergen(?:o|os)?)\b/i.test(normalized(prompt));
}

function supportedAllergenValue(value: string, prompt: string) {
  const v = normalized(value);
  const p = normalized(prompt);
  if (/^(?:ninguno|ninguno conocido|sin alergen)/.test(v)) {
    return /\b(?:sin\s+alergen(?:o|os)?|no\s+(?:contiene|tiene)\s+alergen(?:o|os)?|ninguno)\b/.test(p);
  }
  const stop = new Set(['contiene','puede','tener','trazas','alergenos','alergeno','conocido','conocidos']);
  const tokens = v.split(/[^a-z0-9ñ]+/i).filter((token) => token.length >= 3 && !stop.has(token));
  // A proposed allergen must not contradict an explicit seller denial.
  // Negated ingredients are not positive evidence merely because their names occur.
  const blanketDenial = /\b(?:sin alergen(?:o|os)?|no (?:contiene|tiene) alergen(?:o|os)?)\b/.test(p);
  const denied = tokens.some((token) =>
    new RegExp(`\\b(?:sin(?: trazas de)?|no (?:contienen?|tienen?|llevan?)|libre de)\\s+${token}\\b`).test(p));
  return tokens.length > 0 && !blanketDenial && !denied && tokens.every((token) => p.includes(token));
}

export function sanitizeTopiStructuredAttributes(
  raw: unknown,
  category: ProductCategory | undefined,
  prompt: string,
) {
  if (!category || !raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const source = raw as Record<string, unknown>;
  const allowed = nationalFieldsFor(category);
  if (!allowed.length) return undefined;
  const output: Record<string, string | number | boolean> = {};

  for (const field of allowed) {
    if (!(field.key in source)) continue;
    const value = source[field.key];

    if (field.kind === 'boolean') {
      if (typeof value === 'boolean' && field.key === 'warranty' && supportedWarranty(value, prompt)) output[field.key] = value;
      continue;
    }

    if (field.kind === 'number') {
      const number = Number(value);
      if (Number.isFinite(number) && number >= 0 && number <= 1_000_000 && groundedInSellerPrompt(number, prompt)) output[field.key] = Math.round(number * 100) / 100;
      continue;
    }

    const text = safeText(value, 300);
    // Allergens have their own stricter semantic evidence gate below (e.g. "none known").
    if (!text || containsContactOrSecret(text) || (field.key !== 'allergens' && !groundedInSellerPrompt(text, prompt))) continue;

    if (field.key === 'allergens') {
      if (!explicitAllergenEvidence(prompt) || !supportedAllergenValue(text, prompt)) continue;
    }

    if (['approximate_zone', 'origin_zone', 'destination_zone'].includes(field.key) && looksExactAddress(text)) continue;
    if (field.key === 'approximate_zone' && !explicitZoneEvidence(prompt)) continue;

    output[field.key] = text;
  }

  return Object.keys(output).length ? output : undefined;
}
