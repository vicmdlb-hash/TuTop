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

function containsContactOrSecret(text: string) {
  return /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text)
    || /(?<!\d)(?:\d[\s().-]?){9}\d(?!\d)/.test(text)
    || /\b(?:otp|c[oó]digo|token|contrase(?:ñ|n)a|password|pin)\b\s*[:=-]?\s*[A-Z0-9-]{4,}/i.test(text);
}

function looksExactAddress(text: string) {
  const clean = normalized(text);
  return /\b(?:calle|avenida|av\.?|boulevard|blvd|carretera|privada|numero|num\.?|#)\b[^\n]{0,60}\b\d{1,6}\b/i.test(clean);
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
  return tokens.length > 0 && tokens.every((token) => p.includes(token));
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
      if (typeof value === 'boolean') output[field.key] = value;
      continue;
    }

    if (field.kind === 'number') {
      const number = Number(value);
      if (Number.isFinite(number) && number >= 0 && number <= 1_000_000) output[field.key] = Math.round(number * 100) / 100;
      continue;
    }

    const text = safeText(value, 300);
    if (!text || containsContactOrSecret(text)) continue;

    if (field.key === 'allergens') {
      if (!explicitAllergenEvidence(prompt) || !supportedAllergenValue(text, prompt)) continue;
    }

    if (field.key === 'approximate_zone') {
      if (!explicitZoneEvidence(prompt) || looksExactAddress(text)) continue;
    }

    output[field.key] = text;
  }

  return Object.keys(output).length ? output : undefined;
}
