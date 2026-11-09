export type TopiPrivacyRedaction = 'email' | 'phone' | 'otp' | 'token' | 'credential' | 'address' | 'card' | 'identity';

export type TopiRemoteText = {
  text?: string;
  redactions: TopiPrivacyRedaction[];
};

function normalize(value: unknown) {
  if (typeof value !== 'string') return '';
  // Redact the complete input before enforcing the outbound character limit.
  // Truncating first could leave a partial email, address or token in the prompt.
  return value.replace(/\u0000/g, '').replace(/\s+/g, ' ').trim();
}


// Detect likely payment-card numbers (13–19 digits) only when their Luhn check
// succeeds. This avoids masking ordinary listing quantities and prices.
function isLikelyPaymentCardNumber(value: string) {
  const digits = value.replace(/[ -]/g, '');
  if (digits.length < 13 || digits.length > 19 || /^(\d)\1+$/.test(digits)) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = Number(digits[i]);
    if (double) { digit *= 2; if (digit > 9) digit -= 9; }
    sum += digit;
    double = !double;
  }
  return sum % 10 === 0;
}

export function redactTopiRemoteText(value: unknown, max = 1200): TopiRemoteText {
  let text = normalize(value);
  if (!text) return { text: undefined, redactions: [] };

  const redactions = new Set<TopiPrivacyRedaction>();
  const replace = (pattern: RegExp, label: TopiPrivacyRedaction, placeholder: string) => {
    text = text.replace(pattern, () => {
      redactions.add(label);
      return placeholder;
    });
  };

  replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, 'email', '[correo omitido]');

  // Run before the phone detector: a spaced PAN can otherwise be partially
  // consumed as a ten-digit phone number, leaking the trailing digits.
  text = text.replace(/(?<!\d)(?<!\d[ -])(?:\d[ -]?){12,18}\d(?![ -]?\d)/g, (candidate) => {
    if (!isLikelyPaymentCardNumber(candidate)) return candidate;
    redactions.add('card');
    return '[tarjeta omitida]';
  });

  // Phone redaction is deliberately conservative: redact international MX numbers,
  // formatted 10-digit numbers, or plain numbers only when introduced as contact data.
  replace(/\+?52[\s.-]?(?:\d[\s().-]?){10}(?!\d)/g, 'phone', '[teléfono omitido]');
  replace(/(?<!\d)(?:\d[\s().-]?){9}\d(?!\d)/g, 'phone', '[teléfono omitido]');
  replace(/\b(?:tel(?:e|é)fono|celular|m[oó]vil|whatsapp|contacto)\s*[:=-]?\s*\d{10,14}\b/gi, 'phone', '[teléfono omitido]');

  // Mexican personal identification numbers must not enter a remote prompt
  // when pasted with explicit CURP/RFC labels. Keep this narrow to avoid
  // confusing product serial numbers with government identity fields.
  replace(/\bCURP\s*(?:(?:[:=-]|\bes\b)\s*)?[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]{2}\b/giu,
    'identity', '[identificador omitido]');
  replace(/\bRFC\s*(?:(?:[:=-]|\bes\b)\s*)?[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}\b/giu,
    'identity', '[identificador omitido]');

  replace(/\b(?:otp|c[oó]digo(?:\s+de)?\s+verificaci[oó]n|verification\s+code)\s*(?:(?:[:=-]|\bes\b)\s*)?[A-Z0-9._-]{4,32}\b/gi, 'otp', '[código omitido]');
  replace(/\b(?:bearer|token|access[_ -]?token|id[_ -]?token|refresh[_ -]?token)\s*(?:(?:[:=-]|\bes\b)\s*)?[A-Z0-9._~+\/-]{8,}\b/gi, 'token', '[token omitido]');
  // Unlabelled API keys are also sensitive; a user may paste a config file
  // into Topi without writing "token:". These patterns are intentionally
  // narrow to avoid masking ordinary product descriptions.
  replace(/\bAIza[0-9A-Za-z_-]{35}\b/g, 'token', '[token omitido]');
  replace(/\bsk-(?:proj-)?[A-Za-z0-9_-]{16,}\b/g, 'token', '[token omitido]');

  // Explicit password, access-key and PIN labels must not leak into future
  // remote prompts, including multiword secrets. Keep the provider disabled.
  replace(/\b(?:contrase(?:ñ|n)a|password|passcode|pin(?:\s+de\s+acceso)?|clave(?:\s+(?:de\s+acceso|secreta))?)\s*(?::|=|-|\bes\b)\s*[^,;]{4,140}/giu,
    'credential', '[credencial omitida]');

  // Explicit street addresses entered in free text are not safe for remote AI.
  // Redact the whole street span (not only the first digit in '5 de Mayo 123').
  // This is deliberately conservative and is not a substitute for provider privacy approval.
  replace(/\b(?:calle|avenida|av\.?|blvd\.?|boulevard|calzada|privada|cerrada|prolongaci[oó]n)\s+[^,;\n]{1,90}\d{1,5}[^,;\n]{0,30}/giu, 'address', '[domicilio omitido]');
  replace(/\b(?:direcci[oó]n|domicilio)\s*(?::|=|-|es)?\s*[^,;\n]{3,100}/giu, 'address', '[domicilio omitido]');
  // Some street/house numbers are introduced as a "zona" or "colonia", not "calle".
  // Do not mask coarse travel distances or named neighborhoods like "20 de Noviembre".
  replace(/\b(?:zona|colonia)\s+(?:[a-záéíóúñ]+(?:\s+[a-záéíóúñ]+){0,4})\s+#?\d{1,6}\b(?!\s*(?:min(?:utos?)?|km|metros?|m|\/))/giu,
    'address', '[domicilio omitido]');

  return { text: text.slice(0, Math.max(0, max)) || undefined, redactions: [...redactions] };
}
