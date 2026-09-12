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

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  }
}

export function topiVoiceSupported() {
  return typeof window !== 'undefined' && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
}

/**
 * Starts a short Spanish-MX dictation session for Topi. Android RECORD_AUDIO is
 * requested by the WebView only when the user taps the microphone control.
 * No audio bytes are persisted by TuTop and no recording is uploaded here.
 */
export function startTopiDictation(callbacks: {
  onText: (text: string) => void;
  onStatus?: (status: 'listening' | 'done' | 'error' | 'unsupported') => void;
}) {
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
