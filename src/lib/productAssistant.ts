import type { AssistantResult, MeetingPoint, Product, ProductCategory, ProductFormData } from '../types';

export const MARKETPLACE_CATEGORIES: ProductCategory[] = [
  'Electrónica',
  'Ropa & Accesorios',
  'Libros & Apuntes',
  'Comida',
  'Postres',
  'Servicios',
  'Transporte',
  'Cuartos & Renta',
  'Eventos',
  'Arte & Manualidades',
  'Otros',
];

// Old records remain readable while new listings use the cleaner category name.
export const VALID_CATEGORIES: ProductCategory[] = [...MARKETPLACE_CATEGORIES, 'Apuntes & Guías'];
export const VALID_MEETING_POINTS: MeetingPoint[] = ['Cafetería Central', 'Puerta Principal', 'Salón de Clases', 'Coordinar por Chat'];

const FORBIDDEN_PATTERNS = [
  /\b(arma|armas|pistola|rifle|escopeta|munici[oó]n|cartucho|balas?)\b/i,
  /\b(droga|drogas|coca[ií]na|metanfetamina|fentanilo|marihuana|weed|thc|lsd|mdma|[eé]xtasis)\b/i,
  /\b(cerveza|vino|tequila|vodka|whisk(?:y|ey)|mezcal|ron|licor|bebida\s+alcoh[oó]lica)\b/i,
  /\b(tabaco|cigarros?|cigarrillos?|vape(?:r|ador)?|vapes|nicotina|pods?\s+de\s+vape)\b/i,
  /\b(medicamento\s+con\s+receta|f[aá]rmaco\s+controlado|clonazepam|alprazolam|diazepam|tramadol)\b/i,
  /\b(servicio\s+sexual|sexo\s+por\s+dinero|escort)\b/i,
  /\b(vendo\s+efectivo|cambio\s+efectivo|dinero\s+en\s+efectivo|vendo\s+d[oó]lares?|vendo\s+euros?)\b/i,
  /\b(producto\s+robado|celular\s+robado|art[ií]culo\s+robado|credencial\s+falsa|documento\s+falso|billete\s+falso|pirater[ií]a|r[eé]plica\s+1:1)\b/i,
  /\b(vendo\s+(?:mi\s+)?cuenta\s+(?:de\s+)?(?:netflix|spotify|disney|hbo|max|steam|xbox|playstation|fortnite|free\s*fire|brawl\s*stars)|vendo\s+contrase(?:ñ|n)a|hacke(?:o|ar)|phishing)\b/i,
  /\b(vendo\s+(?:curp|ine|credencial|datos\s+personales)|base\s+de\s+datos\s+de\s+personas)\b/i,
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

function normalize(text: string) {
  return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

export function normalizeCategory(category: ProductCategory | string): ProductCategory {
  if (category === 'Apuntes & Guías') return 'Libros & Apuntes';
  return (VALID_CATEGORIES.includes(category as ProductCategory) ? category : 'Otros') as ProductCategory;
}

export function detectCategory(text: string): ProductCategory | null {
  const value = normalize(text);
  if (/(iphone|ipad|android|celular|telefono|laptop|computadora|audifono|cargador|usb|teclado|mouse|tablet|bocina|electronica)/.test(value)) return 'Electrónica';
  if (/(ropa|tenis|zapato|sudadera|playera|camisa|pantalon|mochila|bolsa|gorra|chamarra|accesorio|vestido)/.test(value)) return 'Ropa & Accesorios';
  if (/(apunte|guia|resumen|libro|cuaderno|manual|formulario|material de estudio|antologia|fotocopia)/.test(value)) return 'Libros & Apuntes';
  if (/(comida|hamburguesa|taco|pizza|burrito|sandwich|torta|chilaquil|tamal|hot dog|comida corrida|ensalada|pasta)/.test(value)) return 'Comida';
  if (/(brownie|galleta|pastel|postre|cupcake|flan|gelatina|alegria|amaranto|dulce|pay|cheesecake)/.test(value)) return 'Postres';
  if (/(servicio|tutoria|asesoria|clase|diseno|edicion|fotografia|traduccion|reparacion|impresion|maquillaje)/.test(value)) return 'Servicios';
  if (/(ride|avent[oó]n|transporte|viaje|lugar en carro|auto compartido|r[aá]ite)/.test(value)) return 'Transporte';
  if (/(cuarto|renta|roomie|departamento|depa|habitacion|alojamiento)/.test(value)) return 'Cuartos & Renta';
  if (/(boleto|evento|concierto|fiesta|entrada|taller|curso|expo)/.test(value)) return 'Eventos';
  if (/(arte|manualidad|pulsera|artesania|dibujo|pintura|tejido|hecho a mano|sticker)/.test(value)) return 'Arte & Manualidades';
  return MARKETPLACE_CATEGORIES.find((category) => normalize(category) === value || value.includes(normalize(category))) || null;
}

export function detectMeetingPoint(text: string): MeetingPoint | null {
  const value = normalize(text);
  if (value.includes('cafeter')) return 'Cafetería Central';
  if (value.includes('puerta') || value.includes('entrada')) return 'Puerta Principal';
  if (value.includes('salon') || value.includes('clases')) return 'Salón de Clases';
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

export function isForbiddenProductText(text: string) {
  return FORBIDDEN_PATTERNS.some((pattern) => pattern.test(text));
}

export function improveDescription(draft: Partial<ProductFormData>) {
  const title = draft.titulo?.trim();
  if (!title) return 'Agrega primero un título para que Topi pueda ayudarte a redactar mejor.';
  const current = draft.descripcion?.trim();
  const category = normalizeCategory(draft.categoria || detectCategory(title) || 'Otros');
  if (current && current.length >= 70) {
    return current
      .replace(/\s+/g, ' ')
      .replace(/^./, (letter) => letter.toUpperCase())
      .slice(0, 900);
  }
  const templates: Partial<Record<ProductCategory, string>> = {
    'Electrónica': `${title}. Indica estado, funcionamiento, accesorios incluidos y cualquier detalle importante. Entrega dentro de la comunidad TuTop.`,
    'Ropa & Accesorios': `${title}. Agrega talla, estado, medidas si aplica y cualquier detalle de uso. Entrega a convenir dentro de TuTop.`,
    'Libros & Apuntes': `${title}. Explica materia/semestre, contenido, formato y estado para que otros estudiantes sepan exactamente qué reciben.`,
    'Comida': `${title}. Describe porción, ingredientes principales, horario de entrega y si requiere pedido previo.`,
    'Postres': `${title}. Describe tamaño o porción, sabor, ingredientes principales y disponibilidad.`,
    'Servicios': `${title}. Explica qué incluye, tiempo estimado, modalidad y qué necesita enviarte la persona interesada.`,
    'Transporte': `${title}. Indica ruta aproximada, horario, lugares disponibles y punto de encuentro.`,
    'Cuartos & Renta': `${title}. Describe zona, servicios incluidos, condiciones básicas y disponibilidad. No publiques datos sensibles.`,
    'Eventos': `${title}. Indica fecha, lugar general, qué incluye y condiciones de entrega o acceso.`,
    'Arte & Manualidades': `${title}. Describe materiales, tamaño, personalización disponible y tiempo de entrega.`,
  };
  return templates[category] || `${title}. Agrega estado, características principales, qué incluye y cualquier detalle que ayude a decidir la compra.`;
}

export function suggestPriceFromProducts(draft: Partial<ProductFormData>, products: Product[]) {
  const category = draft.categoria ? normalizeCategory(draft.categoria) : detectCategory(`${draft.titulo || ''} ${draft.descripcion || ''}`);
  if (!category) return null;
  const comparable = products
    .filter((product) => normalizeCategory(product.categoria) === category && product.estado === 'Activo' && product.precio_mxn > 0)
    .map((product) => product.precio_mxn)
    .sort((a, b) => a - b);
  if (comparable.length < 2) return null;
  const median = comparable[Math.floor(comparable.length / 2)];
  const low = Math.max(1, Math.round(median * 0.8 / 5) * 5);
  const high = Math.max(low, Math.round(median * 1.2 / 5) * 5);
  return { low, high, median, samples: comparable.length };
}

export function reviewProductDraft(draft: Partial<ProductFormData>) {
  const issues: string[] = [];
  const fullText = `${draft.titulo || ''} ${draft.descripcion || ''}`;
  if (isForbiddenProductText(fullText)) issues.push('El anuncio parece incluir algo que no está permitido en TuTop.');
  if (!draft.titulo || draft.titulo.trim().length < 3) issues.push('Agrega un título claro.');
  if (!draft.precio_mxn || draft.precio_mxn <= 0) issues.push('Agrega un precio mayor a $0.');
  if (!draft.categoria) issues.push('Elige una categoría.');
  if (!draft.punto_encuentro) issues.push('Elige cómo coordinarás la entrega.');
  if (!draft.imagen_url && !draft.imagenes_url?.length) issues.push('Una foto ayuda mucho a que el anuncio genere confianza.');
  if ((draft.descripcion?.trim().length || 0) < 20) issues.push('Una descripción un poco más completa puede ayudarte a vender más rápido.');
  return issues;
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
    case 'titulo': return '¿Qué quieres vender u ofrecer?';
    case 'precio_mxn': return '¿Qué precio quieres ponerle?';
    case 'categoria': return 'Puedo sugerirte una categoría, pero tú siempre tienes la última palabra.';
    case 'punto_encuentro': return '¿Cómo prefieres coordinar la entrega?';
    case 'facultad': return '¿En qué facultad lo quieres publicar?';
    default: return 'Listo. Revisa los datos y publica cuando quieras.';
  }
}

// Compatibility parser kept for older flows/tests. New UI is manual-first.
export function parseProductMessage(text: string, previous: Partial<ProductFormData>, defaultFaculty: string): AssistantResult {
  if (isForbiddenProductText(text)) {
    return { blocked: true, response: 'Ese tipo de publicación no está permitido en TuTop.', data: previous, complete: false, needs: nextMissing(previous) };
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
    if (candidate && candidate.length > 2) data.titulo = candidate;
  }
  const missing = nextMissing(data);
  return { response: askFor(missing), data, complete: missing === null, needs: missing };
}
