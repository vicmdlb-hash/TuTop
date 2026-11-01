export type SafeQaEvent = { at: string; kind: string; detail?: string };

const KINDS = new Set([
  'app_boot', 'network_offline', 'network_online', 'viewport_resize', 'visibility',
  'window_error', 'unhandled_rejection', 'push_action', 'push_received',
]);

function safeDetail(kind: string, value: unknown): string | undefined {
  if (kind === 'window_error' || kind === 'unhandled_rejection') return 'redacted';
  if (typeof value !== 'string') return undefined;
  if (kind === 'visibility') return ['visible', 'hidden', 'prerender'].includes(value) ? value : undefined;
  if (kind === 'network_offline' && /^seq=\d{1,8}$/.test(value)) return value;
  if (kind === 'network_online' && /^seq=\d{1,8} duration_ms=-?\d{1,10}$/.test(value)) return value;
  if (kind === 'push_action' || kind === 'push_received') {
    if (/^target=(chat|listing|transaction|saved_search|generic) correlation=([0-9a-f]{16}|none|unavailable)$/.test(value)) return value;
    return 'metadata_redacted';
  }
  // App version and viewport already exist as structured fields in the QA report.
  return undefined;
}

export function sanitizePhysicalQaEvent(kind: unknown, detail?: unknown): Pick<SafeQaEvent, 'kind' | 'detail'> {
  const normalized = typeof kind === 'string' && KINDS.has(kind) ? kind : 'unknown_event';
  const safe = safeDetail(normalized, detail);
  return { kind: normalized, ...(safe === undefined ? {} : { detail: safe }) };
}

export function sanitizePhysicalQaHistory(value: unknown): SafeQaEvent[] {
  if (!Array.isArray(value)) return [];
  return value.slice(-120).flatMap((item): SafeQaEvent[] => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const row = item as Record<string, unknown>;
    if (typeof row.at !== 'string') return [];
    const time = Date.parse(row.at);
    if (Number.isNaN(time) || new Date(time).toISOString() !== row.at) return [];
    return [{ at: row.at, ...sanitizePhysicalQaEvent(row.kind, row.detail) }];
  });
}
