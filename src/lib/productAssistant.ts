import type { AssistantResult, MeetingPoint, ProductCategory, ProductFormData } from '../types';

export const VALID_CATEGORIES: ProductCategory[] = ['Comida', 'Postres', 'Apuntes & Guías', 'Ropa & Accesorios', 'Servicios', 'Otros'];
export const VALID_MEETING_POINTS: MeetingPoint[] = ['Cafetería Central', 'Puerta Principal', 'Salón de Clases', 'Coordinar por Chat'];

const FORBIDDEN_PATTERNS = [
  // Armas y municiones.
  /\b(arma|armas|pistola|rifle|escopeta|munici[oó]n|cartucho|balas?)\b/i,
  // Drogas recreativas y sustancias de alto riesgo.
  /\b(droga|drogas|coca[ií]na|metanfetamina|fentanilo|marihuana|weed|thc|lsd|mdma|[eé]xtasis)\b/i,
  // Alcohol, tabaco, vapeo y nicotina no forman parte de la beta universitaria.
  /\b(cerveza|vino|tequila|vodka|whisk(?:y|ey)|mezcal|ron|licor|bebida\s+alcoh[oó]lica)\b/i,
  /\b(tabaco|cigarros?|cigarrillos?|vape(?:r|ador)?|vapes|nicotina|pods?\s+de\s+vape)\b/i,
  // Medicamentos sujetos a receta o control especial.
  /\b(medicamento\s+con\s+receta|f[aá]rmaco\s+controlado|clonazepam|alprazolam|diazepam|tramadol)\b/i,
  // Servicios sexuales o contenido explícitamente comercial de carácter sexual.
  /\b(servicio\s+sexual|sexo\s+por\s+dinero|escort)\b/i,
  // Efectivo, divisas y operaciones que intentan convertir TuTop en un mercado financiero.
  /\b(vendo\s+efectivo|cambio\s+efectivo|dinero\s+en\s+efectivo|vendo\s+d[oó]lares?|vendo\s+euros?)\b/i,
  // Bienes robados, falsificación y documentos falsos.
  /\b(producto\s+robado|celular\s+robado|art[ií]culo\s+robado|credencial\s+falsa|documento\s+falso|billete\s+falso|pirater[ií]a)\b/i,
  // Venta de cuentas/credenciales y fraude digital.
  /\b(vendo\s+(?:mi\s+)?cuenta\s+(?:de\s+)?(?:netflix|spotify|disney|hbo|max|steam|xbox|playstation|fortnite|free\s*fire|brawl\s*stars)|vendo\s+contrase(?:ñ|n)a|hacke(?:o|ar)|phishing)\b/i,
  // Datos personales o suplantación comercializada.
  /\b(vendo\s+(?:curp|ine|credencial|datos\s+personales)|base\s+de\s+datos\s+de\s+personas)\b/i,
  // Fraude académico: los apuntes y tutorías sí están permitidos; exámenes/respuestas filtradas no.
  /\b(vendo\s+(?:el\s+)?examen|vendo\s+respuestas\s+de\s+examen|respuestas\s+del\s+examen|examen\s+filtrado)\b/i,
];

export function sellerLevelFor(points: number) {
  if (points >= 200) return 'Leyenda' as const;
  if (points >= 50) return 'Pro' as const;
  return 'Novato' as const;
}

export function reliabilityFor(strikes: number) {
  if (strikes <= 0) return 98;
  return Math.max(0, 98 - Math.min(strikes, 3) * 26);
}

export function detectCategory(text: string): ProductCategory | null {
  const value = normalize(text);
  if (/(comida|hamburguesa|taco|pizza|burrito|sandwich|s[aá]ndwich|torta|chilaquil|tamales?|hot dog|comida corrida)/.test(value)) return 'Comida';
  if (/(brownie|galleta|pastel|postre|cupcake|flan|gelatina|alegr[ií]a|amaranto|dulce)/.test(value)) return 'Postres';
  if (/(apunte|gu[ií]a|resumen|libro|cuaderno|manual|formulario|acorde[oó]n|material de estudio)/.test(value)) return 'Apuntes & Guías';
  if (/(ropa|tenis|zapato|sudadera|playera|camisa|pantal[oó]n|mochila|bolsa|gorra|chamarra|accesorio)/.test(value)) return 'Ropa & Accesorios';
  if (/(servicio|tutor[ií]a|asesor[ií]a|clase|diseño|edici[oó]n|fotograf[ií]a|traducci[oó]n|reparaci[oó]n)/.test(value)) return 'Servicios';
  return VALID_CATEGORIES.find((category) => normalize(category) === value || value.includes(normalize(category))) || null;
}

export function detectMeetingPoint(text: string): MeetingPoint | null {
  const value = normalize(text);
  if (value.includes('cafeter')) return 'Cafetería Central';
  if (value.includes('puerta') || value.includes('entrada')) return 'Puerta Principal';
  if (value.includes('salon') || value.includes('salón') || value.includes('clases')) return 'Salón de Clases';
  if (value.includes('chat') || value.includes('coordinar') || value.includes('ponernos de acuerdo')) return 'Coordinar por Chat';
  return null;
}

export function extractPrice(text: string): number | null {
  const normalized = text.replace(/,/g, '').replace(/\s+/g, ' ');
  const currencyMatch = normalized.match(/(?:\$\s*|precio(?:\s+de)?\s*|a\s+)(\d+(?:\.\d{1,2})?)(?:\s*(?:mxn|pesos?))?/i);
  if (currencyMatch) return Number(currencyMatch[1]);
  if (/^\s*\d+(?:\.\d{1,2})?\s*(?:mxn|pesos?)?\s*$/i.test(normalized)) {
    const number = normalized.match(/\d+(?:\.\d{1,2})?/);
    return number ? Number(number[0]) : null;
  }
  return null;
}

export function cleanTitle(text: string): string | null {
  let candidate = text.trim();
  candidate = candidate
    .replace(/^\s*(vendo|ofrezco|tengo|quiero vender|voy a vender)\s+/i, '')
    .replace(/\s+(?:a|en)\s+\$?\d+(?:\.\d{1,2})?\s*(?:mxn|pesos?)?.*$/i, '')
    .replace(/\s+(?:por|a)\s+\$?\d+(?:\.\d{1,2})?\s*(?:mxn|pesos?)?.*$/i, '')
    .trim();
  if (!candidate || candidate.length < 2) return null;
  return candidate.slice(0, 90);
}

function isForbidden(text: string) {
  return FORBIDDEN_PATTERNS.some((pattern) => pattern.test(text));
}

function normalize(text: string) {
  return text.toLowerCase().trim();
}

function nextMissing(data: Partial<ProductFormData>): keyof ProductFormData | null {
  if (!data.titulo) return 'titulo';
  if (!data.precio_mxn) return 'precio_mxn';
  if (!data.categoria) return 'categoria';
  if (!data.punto_encuentro) return 'punto_encuentro';
  if (!data.facultad) return 'facultad';
  return null;
}

function askFor(field: keyof ProductFormData | null): string {
  switch (field) {
    case 'titulo': return '¿Qué producto o servicio quieres vender?';
    case 'precio_mxn': return 'Perfecto ✨ ¿Cuál es el precio en pesos?';
    case 'categoria': return '¿En qué categoría encaja mejor? Puedes decir “comida”, “ropa”, “apuntes”, “servicios”…';
    case 'punto_encuentro': return '¿Dónde lo entregarías? Cafetería, puerta principal, salón o coordinar por chat.';
    case 'facultad': return '¿En qué facultad quieres ofrecerlo?';
    default: return '¡Listo! Tu anuncio ya está armado.';
  }
}

/**
 * Parser local del asistente de publicación. Acepta varios campos en una sola frase y solo
 * pregunta el dato faltante. En beta real este mismo contrato puede ser servido
 * por una Function/LLM, pero el cliente nunca debe confiar en el LLM para reglas
 * de seguridad o movimientos de UCoins.
 */
export function parseProductMessage(
  text: string,
  previous: Partial<ProductFormData>,
  defaultFaculty: string,
): AssistantResult {
  if (isForbidden(text)) {
    return {
      blocked: true,
      response: '⚠️ Oops, eso va en contra de las reglas de la comunidad de TuTop. Solo permitimos productos y servicios estudiantiles seguros.',
      data: previous,
      complete: false,
      needs: nextMissing(previous),
    };
  }

  const data: Partial<ProductFormData> = { ...previous };
  const price = extractPrice(text);
  const category = detectCategory(text);
  const meetingPoint = detectMeetingPoint(text);

  if (!data.precio_mxn && price && price > 0) data.precio_mxn = price;
  if (!data.categoria && category) data.categoria = category;
  if (!data.punto_encuentro && meetingPoint) data.punto_encuentro = meetingPoint;
  if (!data.facultad) data.facultad = defaultFaculty;

  if (!data.titulo) {
    const candidate = cleanTitle(text);
    // Una respuesta que es solo precio/categoría/punto no debe convertirse en título.
    const looksLikeOnlyMetadata = Boolean(price) && candidate === text.trim();
    if (candidate && !looksLikeOnlyMetadata && candidate.length > 2) data.titulo = candidate;
  }

  // Si todavía falta precio y el mensaje fue una respuesta corta numérica.
  if (!data.precio_mxn) {
    const fallbackPrice = extractPrice(text);
    if (fallbackPrice && fallbackPrice > 0) data.precio_mxn = fallbackPrice;
  }

  if (data.precio_mxn && data.precio_mxn > 10000 && (data.categoria === 'Apuntes & Guías' || data.categoria === 'Comida' || data.categoria === 'Postres')) {
    delete data.precio_mxn;
    return {
      response: `¿Seguro que son $${price?.toLocaleString('es-MX')}? Suena fuera de lo normal para esa categoría 😅. Confírmame el precio correcto.`,
      data,
      complete: false,
      needs: 'precio_mxn',
    };
  }

  const missing = nextMissing(data);
  return {
    response: askFor(missing),
    data,
    complete: missing === null,
    needs: missing,
  };
}
