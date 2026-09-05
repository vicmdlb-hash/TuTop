import type { ProductCategory, ProductFormData } from '../types';

export interface AdaptiveField {
  key: string;
  label: string;
  placeholder: string;
  inputMode?: 'text' | 'numeric' | 'decimal';
}

const FIELDS: Partial<Record<ProductCategory, AdaptiveField[]>> = {
  'Electrónica': [
    { key: 'almacenamiento', label: 'Almacenamiento', placeholder: 'Ej. 128 GB' },
    { key: 'ram', label: 'RAM', placeholder: 'Ej. 8 GB' },
    { key: 'bateria', label: 'Batería', placeholder: 'Ej. dura 6 h / 88%' },
    { key: 'accesorios', label: 'Accesorios', placeholder: 'Ej. cargador y funda' },
    { key: 'garantia', label: 'Garantía', placeholder: 'Ej. 2 meses restantes' },
  ],
  'Ropa & Accesorios': [
    { key: 'genero', label: 'Estilo', placeholder: 'Ej. unisex' },
    { key: 'medidas', label: 'Medidas', placeholder: 'Ej. 54 cm de pecho' },
    { key: 'material', label: 'Material', placeholder: 'Ej. algodón' },
  ],
  'Libros & Apuntes': [
    { key: 'autor', label: 'Autor', placeholder: 'Ej. Kotler' },
    { key: 'materia', label: 'Materia', placeholder: 'Ej. Contabilidad' },
    { key: 'edicion', label: 'Edición', placeholder: 'Ej. 8.ª edición' },
    { key: 'semestre', label: 'Semestre', placeholder: 'Ej. 3.º semestre' },
  ],
  'Apuntes & Guías': [
    { key: 'materia', label: 'Materia', placeholder: 'Ej. Derecho Laboral' },
    { key: 'semestre', label: 'Semestre', placeholder: 'Ej. 5.º semestre' },
    { key: 'formato', label: 'Formato', placeholder: 'Ej. impreso / digital' },
  ],
  'Comida': [
    { key: 'porcion', label: 'Porción', placeholder: 'Ej. 1 orden para una persona' },
    { key: 'ingredientes', label: 'Ingredientes', placeholder: 'Ej. pollo, arroz, verduras' },
    { key: 'alergenos', label: 'Alérgenos', placeholder: 'Ej. contiene lácteos' },
    { key: 'fecha', label: 'Preparación', placeholder: 'Ej. hecho hoy' },
  ],
  'Postres': [
    { key: 'porcion', label: 'Porción', placeholder: 'Ej. rebanada de 150 g' },
    { key: 'ingredientes', label: 'Ingredientes', placeholder: 'Ej. chocolate, nuez' },
    { key: 'alergenos', label: 'Alérgenos', placeholder: 'Ej. contiene huevo y nuez' },
    { key: 'fecha', label: 'Preparación', placeholder: 'Ej. hecho esta mañana' },
  ],
  'Servicios': [
    { key: 'modalidad', label: 'Modalidad', placeholder: 'Ej. presencial / en línea' },
    { key: 'duracion', label: 'Duración', placeholder: 'Ej. sesión de 60 min' },
    { key: 'precio_servicio', label: 'Cobro', placeholder: 'Ej. por hora / por trabajo' },
  ],
  'Transporte': [
    { key: 'origen', label: 'Origen', placeholder: 'Ej. Apizaco' },
    { key: 'destino', label: 'Destino', placeholder: 'Ej. Campus Rectoría' },
    { key: 'horario_ruta', label: 'Horario', placeholder: 'Ej. salida 7:00' },
    { key: 'lugares', label: 'Lugares disponibles', placeholder: 'Ej. 3', inputMode: 'numeric' },
  ],
  'Cuartos & Renta': [
    { key: 'ubicacion', label: 'Zona', placeholder: 'Ej. a 10 min de FCEA' },
    { key: 'servicios', label: 'Servicios', placeholder: 'Ej. agua, luz, internet' },
    { key: 'deposito', label: 'Depósito', placeholder: 'Ej. un mes' },
    { key: 'mensualidad', label: 'Mensualidad', placeholder: 'Ej. $2,800' },
    { key: 'reglas', label: 'Reglas', placeholder: 'Ej. no fumar' },
  ],
  'Eventos': [
    { key: 'fecha_evento', label: 'Fecha', placeholder: 'Ej. 18 de septiembre' },
    { key: 'lugar_evento', label: 'Lugar general', placeholder: 'Ej. Centro Cultural' },
    { key: 'incluye', label: 'Incluye', placeholder: 'Ej. acceso general' },
  ],
  'Arte & Manualidades': [
    { key: 'materiales', label: 'Materiales', placeholder: 'Ej. hilo, chaquira, acero' },
    { key: 'medidas', label: 'Tamaño', placeholder: 'Ej. 20 × 15 cm' },
    { key: 'personalizacion', label: 'Personalización', placeholder: 'Ej. nombre y color a elegir' },
  ],
};

export function adaptiveFieldsFor(category?: ProductCategory) {
  if (!category) return [];
  return FIELDS[category] || [];
}

export function formatListingDescription(
  base: string | undefined,
  draft: Partial<ProductFormData>,
  adaptive: Record<string, string> = {},
) {
  const lines = [
    draft.condicion ? `Estado: ${draft.condicion}` : '',
    draft.marca ? `Marca: ${draft.marca}` : '',
    draft.modelo ? `Modelo: ${draft.modelo}` : '',
    draft.talla ? `Talla/medida: ${draft.talla}` : '',
    draft.color ? `Color: ${draft.color}` : '',
    draft.precio_negociable ? 'Precio negociable: sí' : '',
    draft.metodos_entrega?.length ? `Entrega: ${draft.metodos_entrega.join(', ')}` : '',
    draft.punto_personalizado ? `Punto sugerido: ${draft.punto_personalizado}` : '',
    draft.horario_entrega ? `Horario: ${draft.horario_entrega}` : '',
    draft.disponibilidad ? `Disponibilidad: ${draft.disponibilidad}` : '',
    draft.etiquetas?.length ? `Etiquetas: ${draft.etiquetas.join(', ')}` : '',
    ...Object.entries(adaptive)
      .filter(([, value]) => value.trim())
      .map(([key, value]) => `${labelForAdaptiveKey(draft.categoria, key)}: ${value.trim()}`),
  ].filter(Boolean);
  const cleanBase = (base || '').trim();
  return `${cleanBase}${lines.length ? `${cleanBase ? '\n\n' : ''}Detalles\n${lines.join('\n')}` : ''}`.trim().slice(0, 1000);
}

function labelForAdaptiveKey(category: ProductCategory | undefined, key: string) {
  return adaptiveFieldsFor(category).find((field) => field.key === key)?.label || key;
}

export interface ParsedListingDescription {
  body: string;
  details: Record<string, string>;
}

export function parseListingDescription(description?: string): ParsedListingDescription {
  const raw = description || '';
  const marker = raw.indexOf('\n\nDetalles\n');
  if (marker < 0) return { body: raw.trim(), details: {} };
  const body = raw.slice(0, marker).trim();
  const detailText = raw.slice(marker + '\n\nDetalles\n'.length);
  const details: Record<string, string> = {};
  for (const line of detailText.split('\n')) {
    const separator = line.indexOf(':');
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (key && value) details[key] = value;
  }
  return { body, details };
}

export function detailValue(details: Record<string, string>, label: string) {
  return details[label] || '';
}

export function isNegotiableDescription(description?: string) {
  return detailValue(parseListingDescription(description).details, 'Precio negociable').toLowerCase() === 'sí';
}
