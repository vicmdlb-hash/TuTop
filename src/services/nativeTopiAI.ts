import { getNativeAppCheckToken, initializeNativeAppCheck, nativeAppCheckStatus } from './nativeAppCheckToken';

type CapacitorPlugin = Record<string, (...args: any[]) => Promise<any>>;
type CapacitorRuntime = {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  registerPlugin?: (name: string) => CapacitorPlugin;
  Plugins?: Record<string, CapacitorPlugin>;
};

export type NativeTopiAIReason = 'ready' | 'not-native' | 'disabled' | 'plugin-missing' | 'app-check-unavailable' | 'request-failed' | 'empty-response';
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

function appCheckRequired() {
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

/**
 * Native Firebase AI Logic only. When App Check is required, a valid token is
 * mandatory before the native SDK is called. Private physical-QA builds may
 * explicitly set VITE_TUTOP_AI_APP_CHECK_REQUIRED=false only while the staging
 * AI service is UNENFORCED; production must never inherit that exception.
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

  await initializeNativeAppCheck();
  const appCheckToken = await getNativeAppCheckToken(false);
  if (appCheckRequired() && !appCheckToken) {
    lastReason = 'app-check-unavailable';
    return null;
  }

  const models = preferred === 'gemini-3.8-flash'
    ? ['gemini-3.8-flash', 'gemini-3.5-flash-lite']
    : ['gemini-3.5-flash-lite'];
  for (const model of models) {
    try {
      const result = await ai.generate({ prompt: clean, model });
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
