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
  count: [0, 20],
};
const SAFE_NUMBER_VALUES: Record<string, ReadonlySet<number>> = {
  status_class: new Set([100, 200, 300, 400, 500]),
};
const SAFE_ENUM_VALUES: Record<string, ReadonlySet<string>> = {
  source: new Set(['picker', 'camera', 'gallery']),
  mime: new Set(['mp4', 'webm', 'quicktime']),
  failure_kind: new Set(['none', 'timeout', 'network', 'firebase-config-rejected', 'app-check', 'capacity', 'native-request']),
};

// A code is a known machine label, never an arbitrary exception message.
const SAFE_CODES: Record<DiagnosticCategory, ReadonlySet<string>> = {
  publication: new Set([
    'publish_identity_refresh_failed', 'publish_email_not_verified',
    'publish_self_heal_started', 'publish_self_heal_success',
    'publish_self_heal_refresh_failed', 'publish_self_heal_retry_failed',
    'publish_permission_denied', 'publish_rate_limited', 'publish_session_refresh_failed',
    'publish_email_not_verified_after_refresh', 'publish_media_failed',
    'publish_title_invalid', 'publish_price_invalid', 'publish_quantity_invalid',
    'publish_prohibited', 'publish_private_field_blocked', 'publish_unknown_failed',
  ]),
  ai: new Set([
    'ready', 'not-native', 'disabled', 'audience-provider-not-approved',
    'plugin-missing', 'app-check-unavailable', 'request-failed', 'empty-response',
    'native_plugin_status', 'native_plugin_status_failed', 'topi_privacy_redaction_applied',
  ]),
  location: new Set(['listing_location_opt_in_enabled', 'listing_location_opt_in_removed']),
  media: new Set([
    'storage_http_error', 'video_infrastructure_disabled', 'video_owner_mismatch',
    'video_upload_success', 'video_load_success', 'video_load_failed',
    'video_delete_success', 'photo_processing_failed',
  ]),
  voice: new Set(),
  notifications: new Set(),
  network: new Set(),
};
const ISO_UTC = /^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$/;

function validCategory(value: unknown): value is DiagnosticCategory {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(SAFE_CODES, value);
}

function cleanCode(category: DiagnosticCategory, value: unknown) {
  return typeof value === 'string' && SAFE_CODES[category].has(value) ? value : 'unknown';
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
    } else if (typeof value === 'number' && SAFE_NUMBER_VALUES[key]?.has(value)) {
      output[key] = value;
    } else if (typeof value === 'string' && SAFE_ENUM_VALUES[key]?.has(value)) {
      output[key] = value;
    }
  }
  return Object.keys(output).length ? output : undefined;
}

function cleanEntry(value: unknown): DiagnosticEntry | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const entry = value as Record<string, unknown>;
  if (!validCategory(entry.category) || typeof entry.at !== 'string') return null;
  if (!ISO_UTC.test(entry.at) || Number.isNaN(Date.parse(entry.at))) return null;
  const context = entry.context && typeof entry.context === 'object' && !Array.isArray(entry.context)
    ? cleanContext(entry.context as Record<string, unknown>) : undefined;
  return {
    at: entry.at,
    category: entry.category,
    code: cleanCode(entry.category, entry.code),
    ...(context ? { context } : {}),
  };
}

function readEntries(): DiagnosticEntry[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    const cleaned = Array.isArray(parsed)
      ? parsed.slice(-MAX_ENTRIES).map(cleanEntry).filter((entry): entry is DiagnosticEntry => entry !== null)
      : [];
    // Sanitise historical records in storage, not only newly written events.
    const safeRaw = JSON.stringify(cleaned);
    if (raw !== safeRaw) localStorage.setItem(STORAGE_KEY, safeRaw);
    return cleaned;
  } catch {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* best-effort */ }
    return [];
  }
}

export function recordDiagnostic(category: DiagnosticCategory, code: string, context?: Record<string, unknown>) {
  if (typeof localStorage === 'undefined' || !validCategory(category)) return;
  try {
    const next: DiagnosticEntry = {
      at: new Date().toISOString(),
      category,
      code: cleanCode(category, code),
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