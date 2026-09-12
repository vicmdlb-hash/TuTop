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

export async function generateNativeTopiText(prompt: string): Promise<{ text: string; model: string } | null> {
  if (!nativeTopiAIAvailable()) return null;
  const ai = plugin();
  if (!ai?.generate) return null;
  const clean = prompt.replace(/\u0000/g, '').trim().slice(0, 6000);
  if (clean.length < 3) return null;
  const model = String(import.meta.env.VITE_TUTOP_TOPI_MODEL || 'gemini-3.8-flash').trim();
  if (!['gemini-3.8-flash', 'gemini-3.5-flash-lite'].includes(model)) return null;
  try {
    const result = await ai.generate({ prompt: clean, model });
    const text = String(result?.text || '').trim();
    if (!text) return null;
    return { text, model: String(result?.model || model) };
  } catch {
    return null;
  }
}
