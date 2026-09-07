import type { ListingVisibilityScope } from '../types';
import type { ListingDeliveryMethod } from './listingSchemaV2';

function normalizeIntent(text: string) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function detectListingCondition(text: string): string | undefined {
  const value = normalizeIntent(text);
  if (/\b(como nuevo|casi nuevo)\b/.test(value)) return 'Como nuevo';
  if (/\b(para reparar|no funciona|no enciende|con falla|tiene falla|descompuesto)\b/.test(value)) return 'Para reparar';
  if (/\b(uso visible|desgaste|gastado|rayones|detalles de uso)\b/.test(value)) return 'Uso visible';
  if (/\b(sellado|sellada|sin usar|nuevo|nueva)\b/.test(value)) return 'Nuevo';
  if (/\b(buen estado|usado|usada|funciona bien|funcionando)\b/.test(value)) return 'Buen estado';
  return undefined;
}

export function detectNegotiableIntent(text: string): boolean | undefined {
  const value = normalizeIntent(text);
  if (/\b(precio fijo|no negociable|sin negociar)\b/.test(value)) return false;
  if (/\b(negociable|a tratar|acepto ofertas|escucho ofertas|precio flexible)\b/.test(value)) return true;
  return undefined;
}

export function detectDeliveryIntent(text: string): ListingDeliveryMethod[] {
  const value = normalizeIntent(text);
  const methods: ListingDeliveryMethod[] = [];
  const add = (method: ListingDeliveryMethod) => { if (!methods.includes(method)) methods.push(method); };

  if (/\b(todo mexico|envio nacional|envios nacionales|paqueteria|por dhl|por fedex|por estafeta)\b/.test(value)) add('shipping');
  if (/\b(campus|facultad|universidad|cafeteria|entrada principal|salon|clases)\b/.test(value)) add('campus_meetup');
  if (/\b(recoger|recoges|pasas por|venir por|vienes por)\b/.test(value)) add('pickup');
  if (/\b(entrega local|entrego|te lo llevo|lo llevo|a domicilio)\b/.test(value) && !methods.includes('campus_meetup')) add('local_delivery');

  return methods;
}

export function detectVisibilityIntent(text: string): ListingVisibilityScope | undefined {
  const value = normalizeIntent(text);
  if (/\b(todo mexico|nacional|envio nacional|envios nacionales)\b/.test(value)) return 'national';
  if (/\b(toda la ciudad|mi ciudad|en la ciudad)\b/.test(value)) return 'city';
  if (/\b(zona universitaria|cerca del campus|cerca de campus)\b/.test(value)) return 'university-zone';
  if (/\b(toda la universidad|todos los campus|mi universidad)\b/.test(value)) return 'institution';
  if (/\b(campus|facultad|cafeteria|salon|clases)\b/.test(value)) return 'campus';
  return undefined;
}
