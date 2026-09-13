import { getNativeAppCheckToken, initializeNativeAppCheck } from './nativeAppCheckToken';

type CapacitorPlugin = Record<string, (...args: any[]) => Promise<any>>;
type CapacitorRuntime = {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  registerPlugin?: (name: string) => CapacitorPlugin;
  Plugins?: Record<string, CapacitorPlugin>;
};

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

export function nativeTopiAIAvailable() {
  if (!nativeRuntime()) return false;
  const enabled = String(import.meta.env.VITE_TUTOP_TOPI_FIREBASE_AI_ENABLED || '').toLowerCase() === 'true';
  return enabled && Boolean(plugin()?.generate);
}

/**
 * Native Firebase AI Logic only. App Check is initialized and a valid token is
 * required before asking the native Firebase SDK. Provider/API secrets never
 * enter the JS bundle. If the preferred model is temporarily unavailable the
 * approved Flash Lite model is attempted before returning control to local Topi.
 */
export async function generateNativeTopiText(prompt: string): Promise<{ text: string; model: string } | null> {
  if (!nativeTopiAIAvailable()) return null;
  const ai = plugin();
  if (!ai?.generate) return null;
  const clean = prompt.replace(/\u0000/g, '').trim().slice(0, 6000);
  if (clean.length < 3) return null;

  const preferred = String(import.meta.env.VITE_TUTOP_TOPI_MODEL || 'gemini-3.8-flash').trim();
  if (!['gemini-3.8-flash', 'gemini-3.5-flash-lite'].includes(preferred)) return null;

  await initializeNativeAppCheck();
  const appCheckToken = await getNativeAppCheckToken(false);
  if (!appCheckToken) return null;

  const models = preferred === 'gemini-3.8-flash'
    ? ['gemini-3.8-flash', 'gemini-3.5-flash-lite']
    : ['gemini-3.5-flash-lite'];
  for (const model of models) {
    try {
      const result = await ai.generate({ prompt: clean, model });
      const text = String(result?.text || '').trim();
      if (text) return { text, model: String(result?.model || model) };
    } catch {
      // Try the approved fallback model; local Topi remains the final fallback.
    }
  }
  return null;
}
