// Presentation-only error boundary. Never inspect/stringify an untrusted
// Firebase/transport exception: it may contain auth material or account paths.
const SAFE_SYNC_FAILURE_MESSAGE =
  'No pudimos sincronizar TuTop. Comprueba tu conexión e inténtalo de nuevo.';

export function safeSyncFailureNotice(_error: unknown): string {
  return SAFE_SYNC_FAILURE_MESSAGE;
}
