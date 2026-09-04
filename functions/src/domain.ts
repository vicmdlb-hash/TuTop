export type SellerLevel = 'Novato' | 'Pro' | 'Leyenda';

export const REGION = 'us-central1';
export const TZ = 'America/Mexico_City';
export const WELCOME_BONUS = 10;
export const MAX_BID = 1000;
export const VALID_CATEGORIES = new Set(['Comida', 'Postres', 'Apuntes & Guías', 'Ropa & Accesorios', 'Servicios', 'Otros']);
export const VALID_MEETING_POINTS = new Set(['Cafetería Central', 'Puerta Principal', 'Salón de Clases', 'Coordinar por Chat']);
export const FORBIDDEN = /\b(arma|armas|pistola|rifle|munici[oó]n|droga|drogas|coca[ií]na|metanfetamina|fentanilo|marihuana|servicio\s+sexual|escort)\b/i;

export function sellerLevel(points: number): SellerLevel {
  if (points >= 200) return 'Leyenda';
  if (points >= 50) return 'Pro';
  return 'Novato';
}

/** ISO week key calculated using the business timezone used by TuTop. */
export function weekKey(date = new Date()): string {
  const zoned = new Date(date.toLocaleString('en-US', { timeZone: TZ }));
  const target = new Date(Date.UTC(zoned.getFullYear(), zoned.getMonth(), zoned.getDate()));
  const day = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((target.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export function safeId(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'general';
}

export function rankingId(week: string, faculty: string, category: string): string {
  return `${week}__${safeId(faculty)}__${safeId(category)}`;
}
