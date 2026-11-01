export type DiagnosticCategory = 'publication' | 'ai' | 'location' | 'media' | 'voice' | 'notifications' | 'network';

export type DiagnosticEntry = {
  at: string;
  category: DiagnosticCategory;
  code: string;
  context?: Record<string, string | number | boolean>;
};

const STORAGE_KEY = 'tutop.diagnostics.v092';
const MAX_ENTRIES = 80;
// Only known, non-identifying diagnostic dimensions may be retained.
// Character filtering alone cannot distinguish a harmless label from a UID or token.
const SAFE_BOOLEAN_KEYS = new Set([
  'ready', 'email', 'phone', 'otp', 'token', 'mixed_age_release',
  'configuration_valid', 'app_check_required', 'fallback_model', 'retry', 'app_check_token',
]);
const SAFE_NUMBER_LIMITS: Record<string, readonly [number, number]> = {
  count: [0, 20], status_class: [1, 5],
};
const SAFE_ENUM_VALUES: Record<string, ReadonlySet<string>> = {
  source: new Set(['picker', 'camera', 'gallery']),
  mime: new Set(['mp4', 'webm', 'quicktime']),
  failure_kind: new Set(['none', 'timeout', 'network', 'firebase-config-rejected', 'app-check', 'capacity', 'native-request']),
};

function cleanCode(value: string) {
  return String(value || 'unknown').replace(/[^A-Za-z0-9_.:-]/g, '_').slice(0, 80) || 'unknown';
}

function cleanContext(input?: Record<string, unknown>) {
  if (!input) return undefined;
  const output: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(input).slice(0, 12)) {
    if (typeof value === 'boolean' && SAFE_BOOLEAN_KEYS.has(key)) {
      output[key] = value;
    } else if (typeof value === 'number' && Number.isInteger(value) && SAFE_NUMBER_LIMITS[key]) {
      const [min, max] = SAFE_NUMBER_LIMITS[key];
      if (value >= min && value <= max) output[key] = value;
    } else if (typeof value === 'string' && SAFE_ENUM_VALUES[key]?.has(value)) {
      output[key] = value;
    }
  }
  return Object.keys(output).length ? output : undefined;
}

function readEntries(): DiagnosticEntry[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry) => entry && typeof entry === 'object').slice(-MAX_ENTRIES) as DiagnosticEntry[];
  } catch {
    return [];
  }
}

export function recordDiagnostic(category: DiagnosticCategory, code: string, context?: Record<string, unknown>) {
  if (typeof localStorage === 'undefined') return;
  try {
    const next: DiagnosticEntry = {
      at: new Date().toISOString(),
      category,
      code: cleanCode(code),
      context: cleanContext(context),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...readEntries(), next].slice(-MAX_ENTRIES)));
  } catch {
    // Diagnostics are best-effort and can never block a user action.
  }
}

export function readLocalDiagnostics() {
  return readEntries();
}

export function clearLocalDiagnostics() {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* optional local state */ }
}

// This module intentionally has no API for prompts, tokens, UIDs, phone numbers,
// media URIs, free-form errors or coordinates. Callers may record only a small
// category/code plus primitive allowlisted context such as boolean capability
// flags, retry counts or HTTP status classes.