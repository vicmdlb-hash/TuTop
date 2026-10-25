export type TopiPrivacyRedaction = 'email' | 'phone' | 'otp' | 'token';

export type TopiRemoteText = {
  text?: string;
  redactions: TopiPrivacyRedaction[];
};

function normalize(value: unknown, max: number) {
  if (typeof value !== 'string') return '';
  return value.replace(/\u0000/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
}

export function redactTopiRemoteText(value: unknown, max = 1200): TopiRemoteText {
  let text = normalize(value, max);
  if (!text) return { text: undefined, redactions: [] };

  const redactions = new Set<TopiPrivacyRedaction>();
  const replace = (pattern: RegExp, label: TopiPrivacyRedaction, placeholder: string) => {
    text = text.replace(pattern, () => {
      redactions.add(label);
      return placeholder;
    });
  };

  replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, 'email', '[correo omitido]');

  // Phone redaction is deliberately conservative: redact international MX numbers,
  // formatted 10-digit numbers, or plain numbers only when introduced as contact data.
  replace(/\+?52[\s.-]?(?:\d[\s().-]?){10}(?!\d)/g, 'phone', '[teléfono omitido]');
  replace(/(?<!\d)(?:\d[\s().-]?){9}\d(?!\d)/g, 'phone', '[teléfono omitido]');
  replace(/\b(?:tel(?:e|é)fono|celular|m[oó]vil|whatsapp|contacto)\s*[:=-]?\s*\d{10,14}\b/gi, 'phone', '[teléfono omitido]');

  replace(/\b(?:otp|c[oó]digo(?:\s+de)?\s+verificaci[oó]n|verification\s+code)\s*[:=-]?\s*[A-Z0-9._-]{4,32}\b/gi, 'otp', '[código omitido]');
  replace(/\b(?:bearer|token|access[_ -]?token|id[_ -]?token|refresh[_ -]?token)\s*[:=-]?\s*[A-Z0-9._~+\/-]{8,}\b/gi, 'token', '[token omitido]');
  // Unlabelled API keys are also sensitive; a user may paste a config file
  // into Topi without writing "token:". These patterns are intentionally
  // narrow to avoid masking ordinary product descriptions.
  replace(/\bAIza[0-9A-Za-z_-]{35}\b/g, 'token', '[token omitido]');
  replace(/\bsk-(?:proj-)?[A-Za-z0-9_-]{16,}\b/g, 'token', '[token omitido]');

  return { text: text || undefined, redactions: [...redactions] };
}
