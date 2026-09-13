type SpeechRecognitionAlternativeLike = { transcript?: string };
type SpeechRecognitionResultLike = { 0?: SpeechRecognitionAlternativeLike };
type SpeechRecognitionEventLike = { results?: ArrayLike<SpeechRecognitionResultLike> };
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;
type NativeVoicePlugin = Record<string, (...args: any[]) => Promise<any>>;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  }
}

function capacitorRuntime() {
  if (typeof window === 'undefined') return null;
  return (window as unknown as { Capacitor?: {
    isNativePlatform?: () => boolean;
    getPlatform?: () => string;
    registerPlugin?: (name: string) => NativeVoicePlugin;
    Plugins?: Record<string, NativeVoicePlugin>;
  } }).Capacitor || null;
}

function nativeRuntime() {
  const capacitor = capacitorRuntime();
  if (!capacitor) return false;
  if (typeof capacitor.isNativePlatform === 'function') return capacitor.isNativePlatform();
  return typeof capacitor.getPlatform === 'function' && capacitor.getPlatform() !== 'web';
}

function nativeVoice(): NativeVoicePlugin | null {
  const capacitor = capacitorRuntime();
  if (!capacitor) return null;
  if (typeof capacitor.registerPlugin === 'function') return capacitor.registerPlugin('TuTopVoice');
  return capacitor.Plugins?.TuTopVoice || null;
}

export async function queryTopiVoicePermission(): Promise<'granted' | 'prompt' | 'denied' | 'unsupported'> {
  if (nativeRuntime()) {
    const voice = nativeVoice();
    if (!voice?.checkPermission) return 'unsupported';
    try {
      const result = await voice.checkPermission();
      if (result?.available === false) return 'unsupported';
      const state = String(result?.state || 'prompt');
      return state === 'granted' || state === 'denied' ? state : 'prompt';
    } catch { return 'unsupported'; }
  }
  if (typeof navigator !== 'undefined') {
    try {
      const result = await (navigator.permissions as any).query({ name: 'microphone' });
      return result.state === 'granted' || result.state === 'denied' ? result.state : 'prompt';
    } catch { /* browser will request on use */ }
  }
  return topiVoiceSupported() ? 'prompt' : 'unsupported';
}

export async function requestTopiVoicePermission(): Promise<'granted' | 'prompt' | 'denied' | 'unsupported'> {
  if (nativeRuntime()) {
    const voice = nativeVoice();
    if (!voice?.requestPermission) return 'unsupported';
    try {
      const result = await voice.requestPermission();
      if (result?.available === false) return 'unsupported';
      const state = String(result?.state || 'denied');
      return state === 'granted' ? 'granted' : state === 'prompt' ? 'prompt' : 'denied';
    } catch { return 'denied'; }
  }
  return queryTopiVoicePermission();
}

export function topiVoiceSupported() {
  if (nativeRuntime()) return Boolean(nativeVoice()?.listen);
  return typeof window !== 'undefined' && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
}

/**
 * Starts one Spanish-MX dictation session. Android uses TuTopVoice + the OS
 * speech recognizer with RECORD_AUDIO requested only after the user's tap.
 * Browser builds retain Web Speech as a fallback. No audio bytes are persisted.
 */
export function startTopiDictation(callbacks: {
  onText: (text: string) => void;
  onStatus?: (status: 'listening' | 'done' | 'error' | 'unsupported') => void;
}) {
  if (nativeRuntime()) {
    const voice = nativeVoice();
    let cancelled = false;
    void (async () => {
      if (!voice?.listen) return callbacks.onStatus?.('unsupported');
      const permission = await requestTopiVoicePermission();
      if (cancelled) return;
      if (permission !== 'granted') return callbacks.onStatus?.(permission === 'unsupported' ? 'unsupported' : 'error');
      callbacks.onStatus?.('listening');
      try {
        const result = await voice.listen({ language: 'es-MX' });
        if (cancelled) return;
        const text = String(result?.text || '').trim();
        if (text) callbacks.onText(text);
        callbacks.onStatus?.('done');
      } catch {
        if (!cancelled) callbacks.onStatus?.('error');
      }
    })();
    return () => {
      cancelled = true;
      if (voice?.stop) void voice.stop().catch(() => undefined);
    };
  }

  if (!topiVoiceSupported()) {
    callbacks.onStatus?.('unsupported');
    return () => undefined;
  }
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition!;
  const recognition = new Recognition();
  recognition.lang = 'es-MX';
  recognition.interimResults = false;
  recognition.continuous = false;
  recognition.maxAlternatives = 1;
  recognition.onresult = (event) => {
    const text = String(event.results?.[0]?.[0]?.transcript || '').trim();
    if (text) callbacks.onText(text);
  };
  recognition.onerror = () => callbacks.onStatus?.('error');
  recognition.onend = () => callbacks.onStatus?.('done');
  callbacks.onStatus?.('listening');
  try { recognition.start(); } catch { callbacks.onStatus?.('error'); }
  return () => {
    try { recognition.stop(); } catch { /* already stopped */ }
  };
}
