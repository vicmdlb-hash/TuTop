export type DiagnosticCategory = 'publication' | 'ai' | 'location' | 'media' | 'voice' | 'notifications' | 'network';

export type DiagnosticEntry = {
  at: string;
  category: DiagnosticCategory;
  code: string;
  context?: Record<string, string | number | boolean>;
};

const STORAGE_KEY = 'tutop.diagnostics.v092';
const MAX_ENTRIES = 80;
const SAFE_KEY = /^[a-z][a-z0-9_]{0,39}$/;
const SAFE_VALUE = /^[A-Za-z0-9 _.:/+-]{0,120}$/;

function cleanCode(value: string) {
  return String(value || 'unknown').replace(/[^A-Za-z0-9_.:-]/g, '_').slice(0, 80) || 'unknown';
}

function cleanContext(input?: Record<string, unknown>) {
  if (!input) return undefined;
  const output: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(input).slice(0, 12)) {
    if (!SAFE_KEY.test(key)) continue;
    if (typeof value === 'boolean') output[key] = value;
    else if (typeof value === 'number' && Number.isFinite(value)) output[key] = Math.round(value * 1000) / 1000;
    else if (typeof value === 'string' && SAFE_VALUE.test(value)) output[key] = value.slice(0, 120);
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