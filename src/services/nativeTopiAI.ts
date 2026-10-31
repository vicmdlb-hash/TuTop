import { getNativeAppCheckToken, initializeNativeAppCheck, nativeAppCheckStatus } from './nativeAppCheckToken';
import { recordDiagnostic } from './localDiagnostics';
import { topiRemoteProviderAudienceGate } from '../lib/topiAllAgesProviderGate';

type CapacitorPlugin = Record<string, (...args: any[]) => Promise<any>>;
type CapacitorRuntime = {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  registerPlugin?: (name: string) => CapacitorPlugin;
  Plugins?: Record<string, CapacitorPlugin>;
};

export type NativeTopiAIReason = 'ready' | 'not-native' | 'disabled' | 'audience-provider-not-approved' | 'plugin-missing' | 'app-check-unavailable' | 'request-failed' | 'empty-response';
export type NativeTopiAIFailureKind = 'none' | 'timeout' | 'network' | 'firebase-config-rejected' | 'app-check' | 'capacity' | 'native-request';
const AI_REQUEST_TIMEOUT_MS = 20_000;
const AI_TRANSIENT_RETRY_DELAY_MS = 650;
let lastReason: NativeTopiAIReason = 'disabled';
let lastFailureKind: NativeTopiAIFailureKind = 'none';
let lastModel = '';

function classifyFailure(error: unknown): NativeTopiAIFailureKind {
  const message = String(error instanceof Error ? error.message : error || '');
  if (/TOPI_AI_TIMEOUT|TIMEOUT/i.test(message)) return 'timeout';
  // App Check errors often arrive as 401/403 PERMISSION_DENIED. Classify them
  // before generic Firebase/API-key errors so Device QA does not hide the cause.
  if (/APP.?CHECK|UNAUTHENTICATED|401|PERMISSION_DENIED.*APP.?CHECK|enforce Firebase App Check/i.test(message)) return 'app-check';
  if (/API[_ -]?KEY|REQUEST_DENIED|403|API key not valid|PERMISSION_DENIED/i.test(message)) return 'firebase-config-rejected';
  if (/RESOURCE_EXHAUSTED|429|high demand|503|temporarily unavailable/i.test(message)) return 'capacity';
  if (/NETWORK|ECONN|ENET|fetch|offline/i.test(message)) return 'network';
  return 'native-request';
}

function setReason(reason: NativeTopiAIReason, context?: Record<string, unknown>, failureKind: NativeTopiAIFailureKind = 'none') {
  lastReason = reason;
  lastFailureKind = failureKind;
  recordDiagnostic('ai', reason, context);
}

function runtime(): CapacitorRuntime | null {
  if (typeof window === 'undefined') return null;
  return (window as unknown as { Capacitor?: CapacitorRuntime }).Capacitor || null;
}

function nativeRuntime() {
  const capacitor = runtime();
  if (!capacitor) return false;
  if (typeof capacitor.isNativePlatform === 'function') return capacitor.isNativePlatform();
  return typeof capacitor.getPlatform === 'function' && capacitor.getPlatform() !== 'web';
}

function plugin(): CapacitorPlugin | null {
  const capacitor = runtime();
  if (!capacitor) return null;
  if (typeof capacitor.registerPlugin === 'function') return capacitor.registerPlugin('TuTopAI');
  return capacitor.Plugins?.TuTopAI || null;
}

function firebaseAIEnabled() {
  return String(import.meta.env.VITE_TUTOP_TOPI_FIREBASE_AI_ENABLED || '').toLowerCase() === 'true';
}

function appCheckRequired() {
  // Firebase AI Logic requires production attestation from 2026-11-02.
  // No staging or client-env bypass: sideloaded QA reports unavailable
  // rather than falsely claiming an AI call is safe without App Check.
  return true;
}

export function nativeTopiAIAvailable() {
  if (!nativeRuntime() || !firebaseAIEnabled()) return false;
  // Feature flag and App Check do NOT establish permission for under-18.
  if (!topiRemoteProviderAudienceGate().allowed) return false;
  return Boolean(plugin()?.generate);
}

export function nativeTopiAIStatus() {
  if (!nativeRuntime()) return { available: false, reason: 'not-native' as NativeTopiAIReason, failureKind: 'none' as NativeTopiAIFailureKind, model: '', appCheck: nativeAppCheckStatus() };
  if (!firebaseAIEnabled()) return { available: false, reason: 'disabled' as NativeTopiAIReason, failureKind: 'none' as NativeTopiAIFailureKind, model: '', appCheck: nativeAppCheckStatus() };
  if (!topiRemoteProviderAudienceGate().allowed) return { available: false, reason: 'audience-provider-not-approved' as NativeTopiAIReason, failureKind: 'none' as NativeTopiAIFailureKind, model: '', appCheck: nativeAppCheckStatus() };
  if (!plugin()?.generate) return { available: false, reason: 'plugin-missing' as NativeTopiAIReason, failureKind: 'none' as NativeTopiAIFailureKind, model: '', appCheck: nativeAppCheckStatus() };
  return { available: lastReason === 'ready', reason: lastReason, failureKind: lastFailureKind, model: lastModel, appCheck: nativeAppCheckStatus() };
}

function timeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer = 0;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timer = window.setTimeout(() => reject(new Error('TOPI_AI_TIMEOUT')), timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => window.clearTimeout(timer));
}

function delay(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

/** Native Firebase AI Logic only: a valid App Check token is always mandatory. */
export async function generateNativeTopiText(prompt: string): Promise<{ text: string; model: string; provider: 'firebase-ai-logic' } | null> {
  if (!nativeRuntime()) { setReason('not-native'); return null; }
  if (!firebaseAIEnabled()) { setReason('disabled'); return null; }
  // Abort BEFORE reading the prompt, plugin, token, model or remote transport.
  // This mixed-age release cannot inherit Gemini Developer API eligibility.
  if (!topiRemoteProviderAudienceGate().allowed) {
    setReason('audience-provider-not-approved', { mixed_age_release: true });
    return null;
  }
  const ai = plugin();
  if (!ai?.generate) { setReason('plugin-missing'); return null; }
  const clean = prompt.replace(/\u0000/g, '').trim().slice(0, 6000);
  if (clean.length < 3) return null;

  const preferred = String(import.meta.env.VITE_TUTOP_TOPI_MODEL || 'gemini-3.8-flash').trim();
  if (!['gemini-3.8-flash', 'gemini-3.5-flash-lite'].includes(preferred)) {
    setReason('request-failed', { configuration_valid: false });
    return null;
  }

  // Prove that the generated Android bridge is alive before spending the full
  // generation timeout. A status failure is diagnostic only: generate() remains
  // authoritative because some WebView/plugin versions can expose methods lazily.
  if (ai.status) {
    try {
      const status = await timeout(ai.status({}), 5_000);
      recordDiagnostic('ai', 'native_plugin_status', { ready: status?.ready !== false });
    } catch {
      recordDiagnostic('ai', 'native_plugin_status_failed');
    }
  }

  const required = appCheckRequired();
  let appCheckToken: string | null = null;
  try {
    await initializeNativeAppCheck();
    appCheckToken = await getNativeAppCheckToken(false);
  } catch {
    appCheckToken = null;
  }
  if (required && !appCheckToken) {
    setReason('app-check-unavailable', { app_check_required: true, app_check: nativeAppCheckStatus() }, 'app-check');
    return null;
  }
  const models = preferred === 'gemini-3.8-flash'
    ? ['gemini-3.8-flash', 'gemini-3.5-flash-lite']
    : ['gemini-3.5-flash-lite'];

  for (const [index, model] of models.entries()) {
    // Device A can hit one transient network/plugin cold-start failure even when
    // staging is healthy. Retry the preferred model once, then use the bounded
    // fallback. We still fail closed: no local answer is mislabeled as Firebase AI.
    const attempts = index === 0 ? 2 : 1;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        const result = await timeout(ai.generate({ prompt: clean, model }), AI_REQUEST_TIMEOUT_MS);
        const text = String(result?.text || '').trim();
        if (text) {
          lastModel = String(result?.model || model);
          setReason('ready', { fallback_model: index > 0, retry: attempt > 0, app_check_token: Boolean(appCheckToken) });
          return { text, model: lastModel, provider: 'firebase-ai-logic' };
        }
        setReason('empty-response', { fallback_model: index > 0, retry: attempt > 0 });
      } catch (error) {
        const failureKind = classifyFailure(error);
        setReason('request-failed', { fallback_model: index > 0, retry: attempt > 0, failure_kind: failureKind, app_check: nativeAppCheckStatus() }, failureKind);
      }
      if (attempt + 1 < attempts) await delay(AI_TRANSIENT_RETRY_DELAY_MS);
    }
  }
  return null;
}
