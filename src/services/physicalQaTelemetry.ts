import { getNativeAppCheckToken, isNativeFirebaseRuntime } from './nativeAppCheckToken';
import { nativePushPermission } from './nativeFirebaseSecurity';
import { nationalSchemaEnabled } from './nationalBackend';
import { onlineBackend } from './onlineBackend';
import { getFirebaseConfig } from './runtimeConfig';
import { useAppStore } from '../store/useAppStore';

const LOG_KEY = 'tutop.physical-qa.events.v1';
const MAX_EVENTS = 120;
const APP_VERSION = String(import.meta.env.VITE_TUTOP_APP_VERSION || '0.9.0-beta.0');

type QaEvent = { at: string; kind: string; detail?: string };
export type QaCheck = { key: string; label: string; status: 'pass' | 'warn' | 'fail'; detail: string };
export type PhysicalQaReport = {
  generated_at: string;
  version: string;
  platform: string;
  native_runtime: boolean;
  viewport: { width: number; height: number; dpr: number };
  online: boolean;
  visibility: string;
  checks: QaCheck[];
  events: QaEvent[];
};

function sanitize(value: unknown) {
  return String(value ?? '')
    .replace(/[A-Za-z0-9_-]{100,}/g, '[redacted-token]')
    .replace(/\b\d{10,13}\b/g, '[redacted-number]')
    .slice(0, 280);
}

function readEvents(): QaEvent[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(LOG_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.slice(-MAX_EVENTS) : [];
  } catch {
    return [];
  }
}

export function qaEvent(kind: string, detail?: unknown) {
  if (typeof window === 'undefined') return;
  const events = [...readEvents(), { at: new Date().toISOString(), kind: sanitize(kind).slice(0, 64), ...(detail === undefined ? {} : { detail: sanitize(detail) }) }].slice(-MAX_EVENTS);
  try { localStorage.setItem(LOG_KEY, JSON.stringify(events)); } catch { /* diagnostics must never break the app */ }
}

export function clearQaEvents() {
  try { localStorage.removeItem(LOG_KEY); } catch { /* noop */ }
}

function capacitorPlatform() {
  const cap = (window as unknown as { Capacitor?: { getPlatform?: () => string } }).Capacitor;
  return cap?.getPlatform?.() || 'web';
}

async function appCheckStatus(): Promise<QaCheck> {
  if (!isNativeFirebaseRuntime()) return { key: 'app-check', label: 'App Check token', status: 'warn', detail: 'No es runtime nativo.' };
  const token = await getNativeAppCheckToken(false).catch(() => null);
  return token
    ? { key: 'app-check', label: 'App Check token', status: 'pass', detail: 'Token nativo disponible; enforcement sigue separado.' }
    : { key: 'app-check', label: 'App Check token', status: 'warn', detail: 'No se obtuvo token. Revisar Play Integrity/attestation en el dispositivo.' };
}

export async function buildPhysicalQaReport(): Promise<PhysicalQaReport> {
  const state = useAppStore.getState();
  const config = getFirebaseConfig();
  const session = onlineBackend.session;
  const push = await nativePushPermission().catch(() => 'unavailable' as const);
  const checks: QaCheck[] = [
    {
      key: 'staging-project', label: 'Firebase staging',
      status: config.projectId === 'tutop-beta-vicmdlb-1356585881' ? 'pass' : 'fail',
      detail: config.projectId === 'tutop-beta-vicmdlb-1356585881' ? 'Proyecto staging correcto.' : `Proyecto inesperado: ${sanitize(config.projectId)}`,
    },
    {
      key: 'v2', label: 'Schema V2',
      status: nationalSchemaEnabled() ? 'pass' : 'fail', detail: nationalSchemaEnabled() ? 'V2 habilitado.' : 'V2 deshabilitado.',
    },
    {
      key: 'auth', label: 'Sesión', status: session?.uid ? 'pass' : 'warn', detail: session?.uid ? 'Sesión Firebase activa.' : 'Sin sesión autenticada.',
    },
    {
      key: 'identity', label: 'Identidad universitaria',
      status: state.user?.institution_id && state.user?.campus_id ? 'pass' : 'warn',
      detail: state.user?.institution_id && state.user?.campus_id ? 'Institución y campus hidratados.' : 'Falta institución o campus en memoria.',
    },
    {
      key: 'network', label: 'Conectividad', status: navigator.onLine ? 'pass' : 'warn', detail: navigator.onLine ? 'navigator.onLine=true' : 'Dispositivo offline.',
    },
    {
      key: 'push-permission', label: 'Permiso push', status: push === 'granted' ? 'pass' : 'warn', detail: `Estado: ${push}`,
    },
    await appCheckStatus(),
  ];

  return {
    generated_at: new Date().toISOString(),
    version: APP_VERSION,
    platform: capacitorPlatform(),
    native_runtime: isNativeFirebaseRuntime(),
    viewport: { width: window.innerWidth, height: window.innerHeight, dpr: Number(window.devicePixelRatio || 1) },
    online: navigator.onLine,
    visibility: document.visibilityState,
    checks,
    events: readEvents(),
  };
}

let installed = false;
export function installPhysicalQaTelemetry() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  qaEvent('app_boot', `${APP_VERSION} ${capacitorPlatform()} ${window.innerWidth}x${window.innerHeight}`);
  window.addEventListener('online', () => qaEvent('network_online'));
  window.addEventListener('offline', () => qaEvent('network_offline'));
  window.addEventListener('resize', () => qaEvent('viewport_resize', `${window.innerWidth}x${window.innerHeight} dpr=${window.devicePixelRatio || 1}`));
  document.addEventListener('visibilitychange', () => qaEvent('visibility', document.visibilityState));
  window.addEventListener('error', (event) => qaEvent('window_error', event.message || 'unknown'));
  window.addEventListener('unhandledrejection', (event) => qaEvent('unhandled_rejection', event.reason instanceof Error ? event.reason.message : event.reason));
  window.addEventListener('tutop:native-notification', ((event: CustomEvent<any>) => {
    const detail = event.detail || {};
    const source = detail.source === 'action' ? 'push_action' : 'push_received';
    const target = detail.chat_id ? 'chat' : detail.listing_id ? 'listing' : detail.transaction_id ? 'transaction' : detail.saved_search_id ? 'saved_search' : detail.kind || 'generic';
    qaEvent(source, target);
  }) as EventListener);
}

installPhysicalQaTelemetry();
