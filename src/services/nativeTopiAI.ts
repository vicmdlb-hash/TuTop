import { getNativeAppCheckToken, initializeNativeAppCheck, nativeAppCheckStatus } from './nativeAppCheckToken';

type CapacitorPlugin = Record<string, (...args: any[]) => Promise<any>>;
type CapacitorRuntime = {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  registerPlugin?: (name: string) => CapacitorPlugin;
  Plugins?: Record<string, CapacitorPlugin>;
};

export type NativeTopiAIReason = 'ready' | 'not-native' | 'disabled' | 'plugin-missing' | 'app-check-unavailable' | 'request-failed' | 'empty-response';
const AI_REQUEST_TIMEOUT_MS = 12_000;
let lastReason: NativeTopiAIReason = 'disabled';
let lastModel = '';

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

function isPrivatePhysicalQaBuild() {
  const environment = String(import.meta.env.VITE_TUTOP_ENVIRONMENT || '').trim().toLowerCase();
  const version = String(import.meta.env.VITE_TUTOP_APP_VERSION || '').trim();
  return environment === 'staging' && /^0\.9\.2-beta\./.test(version);
}

function appCheckRequired() {
  // Private 0.9.2 physical QA keeps Firebase AI App Check UNENFORCED on the
  // staging backend. Play Integrity is still initialized and observed, but a
  // sideloaded APK must not lose the real AI path only because attestation is
  // unavailable. Production/release builds keep the configured strict default.
  if (isPrivatePhysicalQaBuild()) return false;
  return String(import.meta.env.VITE_TUTOP_AI_APP_CHECK_REQUIRED || 'true').toLowerCase() !== 'false';
}

export function nativeTopiAIAvailable() {
  if (!nativeRuntime()) return false;
  return firebaseAIEnabled() && Boolean(plugin()?.generate);
}

export function nativeTopiAIStatus() {
  if (!nativeRuntime()) return { available: false, reason: 'not-native' as NativeTopiAIReason, model: '', appCheck: nativeAppCheckStatus() };
  if (!firebaseAIEnabled()) return { available: false, reason: 'disabled' as NativeTopiAIReason, model: '', appCheck: nativeAppCheckStatus() };
  if (!plugin()?.generate) return { available: false, reason: 'plugin-missing' as NativeTopiAIReason, model: '', appCheck: nativeAppCheckStatus() };
  return { available: lastReason === 'ready', reason: lastReason, model: lastModel, appCheck: nativeAppCheckStatus() };
}

function timeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer = 0;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timer = window.setTimeout(() => reject(new Error('TOPI_AI_TIMEOUT')), timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => window.clearTimeout(timer));
}

/**
 * Native Firebase AI Logic only. Production may require a valid App Check token
 * before the SDK call. Private 0.9.2 staging Physical-QA deliberately leaves
 * enforcement off, so token acquisition is best-effort and cannot silently
 * downgrade Topi to the deterministic local assistant.
 */
export async function generateNativeTopiText(prompt: string): Promise<{ text: string; model: string; provider: 'firebase-ai-logic' } | null> {
  if (!nativeRuntime()) { lastReason = 'not-native'; return null; }
  if (!firebaseAIEnabled()) { lastReason = 'disabled'; return null; }
  const ai = plugin();
  if (!ai?.generate) { lastReason = 'plugin-missing'; return null; }
  const clean = prompt.replace(/\u0000/g, '').trim().slice(0, 6000);
  if (clean.length < 3) return null;

  const preferred = String(import.meta.env.VITE_TUTOP_TOPI_MODEL || 'gemini-3.8-flash').trim();
  if (!['gemini-3.8-flash', 'gemini-3.5-flash-lite'].includes(preferred)) return null;

  const required = appCheckRequired();
  let appCheckToken: string | null = null;
  try {
    await initializeNativeAppCheck();
    appCheckToken = await getNativeAppCheckToken(false);
  } catch {
    appCheckToken = null;
  }
  if (required && !appCheckToken) {
    lastReason = 'app-check-unavailable';
    return null;
  }

  const models = preferred === 'gemini-3.8-flash'
    ? ['gemini-3.8-flash', 'gemini-3.5-flash-lite']
    : ['gemini-3.5-flash-lite'];

  for (const model of models) {
    try {
      const result = await timeout(ai.generate({ prompt: clean, model }), AI_REQUEST_TIMEOUT_MS);
      const text = String(result?.text || '').trim();
      if (text) {
        lastReason = 'ready';
        lastModel = String(result?.model || model);
        return { text, model: lastModel, provider: 'firebase-ai-logic' };
      }
      lastReason = 'empty-response';
    } catch {
      lastReason = 'request-failed';
    }
  }
  return null;
}
