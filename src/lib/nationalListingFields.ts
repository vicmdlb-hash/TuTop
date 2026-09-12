import type { ProductCategory } from '../types';

export type NationalListingField = {
  key: string;
  label: string;
  placeholder: string;
  required?: boolean;
  kind?: 'text' | 'number' | 'boolean';
};

const fields: Partial<Record<ProductCategory, NationalListingField[]>> = {
  'Electrónica': [
    { key: 'brand', label: 'Marca', placeholder: 'Ej. Apple' },
    { key: 'model', label: 'Modelo', placeholder: 'Ej. iPhone 13' },
    { key: 'storage_gb', label: 'Almacenamiento', placeholder: 'Ej. 128', kind: 'number' },
    { key: 'battery_health', label: 'Batería %', placeholder: 'Ej. 88', kind: 'number' },
    { key: 'warranty', label: 'Garantía vigente', placeholder: '', kind: 'boolean' },
  ],
  'Ropa & Accesorios': [
    { key: 'size', label: 'Talla', placeholder: 'Ej. M' },
    { key: 'style', label: 'Estilo', placeholder: 'Ej. unisex / casual' },
    { key: 'color', label: 'Color', placeholder: 'Ej. negro' },
    { key: 'material', label: 'Material', placeholder: 'Ej. algodón' },
  ],
  'Libros & Apuntes': [
    { key: 'subject', label: 'Materia', placeholder: 'Ej. Microeconomía' },
    { key: 'career', label: 'Carrera', placeholder: 'Ej. Turismo' },
    { key: 'semester', label: 'Semestre', placeholder: 'Ej. 5' },
    { key: 'author', label: 'Autor', placeholder: 'Ej. Mankiw' },
    { key: 'edition', label: 'Edición', placeholder: 'Ej. 8.ª' },
  ],
  'Apuntes & Guías': [
    { key: 'subject', label: 'Materia', placeholder: 'Ej. Derecho Laboral' },
    { key: 'teacher', label: 'Profesor/a', placeholder: 'Ej. nombre del docente' },
    { key: 'career', label: 'Carrera', placeholder: 'Ej. Turismo' },
    { key: 'semester', label: 'Semestre', placeholder: 'Ej. 5' },
    { key: 'format', label: 'Formato', placeholder: 'Ej. impreso / digital' },
  ],
  'Comida': [
    { key: 'ingredients', label: 'Ingredientes', placeholder: 'Ej. pollo, arroz, verduras', required: true },
    { key: 'allergens', label: 'Alérgenos', placeholder: 'Ej. lácteos; escribe “ninguno conocido” si aplica', required: true },
    { key: 'availability', label: 'Disponibilidad', placeholder: 'Ej. hoy 12:00–16:00', required: true },
    { key: 'preparation_note', label: 'Preparación', placeholder: 'Ej. preparado hoy' },
    { key: 'delivery_window', label: 'Entrega', placeholder: 'Ej. 13:00–15:00' },
  ],
  'Postres': [
    { key: 'ingredients', label: 'Ingredientes', placeholder: 'Ej. chocolate, huevo, leche', required: true },
    { key: 'allergens', label: 'Alérgenos', placeholder: 'Ej. contiene huevo y nuez', required: true },
    { key: 'availability', label: 'Disponibilidad', placeholder: 'Ej. hoy 14:00–18:00', required: true },
    { key: 'preparation_note', label: 'Preparación', placeholder: 'Ej. hecho esta mañana' },
    { key: 'delivery_window', label: 'Entrega', placeholder: 'Ej. 15:00–17:00' },
  ],
  'Cuartos & Renta': [
    { key: 'monthly_price', label: 'Mensualidad', placeholder: 'Ej. 2800', kind: 'number', required: true },
    { key: 'deposit', label: 'Depósito', placeholder: 'Ej. 2800', kind: 'number', required: true },
    { key: 'included_services', label: 'Servicios incluidos', placeholder: 'Ej. agua, luz, internet', required: true },
    { key: 'approximate_zone', label: 'Zona aproximada', placeholder: 'Ej. a 10 min del campus; nunca dirección exacta', required: true },
    { key: 'campus_distance', label: 'Distancia al campus', placeholder: 'Ej. 1.5 km / 10 min', required: true },
    { key: 'room_type', label: 'Tipo de habitación', placeholder: 'Ej. individual amueblada', required: true },
    { key: 'house_rules', label: 'Reglas', placeholder: 'Ej. no fumar' },
  ],
  'Transporte': [
    { key: 'origin_zone', label: 'Zona de salida', placeholder: 'Ej. centro de la ciudad', required: true },
    { key: 'destination_zone', label: 'Destino', placeholder: 'Ej. campus principal / facultad', required: true },
    { key: 'departure_window', label: 'Horario', placeholder: 'Ej. 06:45–07:00', required: true },
    { key: 'rideshare_cost_share', label: 'Cooperación', placeholder: 'Ej. 35', kind: 'number', required: true },
    { key: 'available_seats', label: 'Lugares', placeholder: 'Ej. 3', kind: 'number' },
  ],
  'Servicios': [
    { key: 'service_mode', label: 'Modalidad', placeholder: 'Ej. presencial / en línea' },
    { key: 'duration', label: 'Duración', placeholder: 'Ej. 60 min' },
    { key: 'price_basis', label: 'Forma de cobro', placeholder: 'Ej. por hora / por trabajo' },
  ],
  'Eventos': [
    { key: 'event_date', label: 'Fecha', placeholder: 'Ej. 18/09/2026' },
    { key: 'general_venue', label: 'Lugar general', placeholder: 'Ej. Centro Cultural' },
    { key: 'ticket_details', label: 'Qué incluye', placeholder: 'Ej. acceso general' },
  ],
  'Entradas permitidas': [
    { key: 'event_date', label: 'Fecha', placeholder: 'Ej. 18/09/2026' },
    { key: 'general_venue', label: 'Lugar general', placeholder: 'Ej. Auditorio' },
    { key: 'ticket_details', label: 'Tipo de entrada', placeholder: 'Ej. acceso general' },
  ],
};

export function nationalFieldsFor(category?: ProductCategory) {
  return category ? fields[category] || [] : [];
}

export function normalizeNationalAttributes(fieldsForCategory: NationalListingField[], values: Record<string, string | number | boolean>) {
  const output: Record<string, string | number | boolean | string[]> = {};
  for (const field of fieldsForCategory) {
    const value = values[field.key];
    if (field.kind === 'boolean') {
      if (typeof value === 'boolean') output[field.key] = value;
      continue;
    }
    const text = String(value ?? '').trim();
    if (!text) continue;
    if (field.kind === 'number') {
      const number = Number(text);
      if (Number.isFinite(number)) output[field.key] = number;
      else output[field.key] = text.slice(0, 180);
    } else output[field.key] = text.slice(0, 300);
  }
  return output;
}
