import type { Product } from '../types';

export type ApproxLocationSource = 'device' | 'cache' | 'campus';
export type ApproxLocation = {
  latitude: number;
  longitude: number;
  captured_at: string;
  source: ApproxLocationSource;
};

const LOCATION_KEY = 'tutop.approx-location.v1';
export const NEARBY_LOCATION_EVENT = 'tutop:approx-location';
export const NEARBY_RADIUS_OPTIONS = [5, 10, 25, 50] as const;
const GEO_CELL_DEGREES = 1;

function validCoordinate(latitude: number, longitude: number) {
  return Number.isFinite(latitude) && Number.isFinite(longitude)
    && latitude >= -90 && latitude <= 90
    && longitude >= -180 && longitude <= 180;
}

/**
 * Privacy rule: TuTop never persists exact device coordinates in listings.
 * Two decimals are roughly kilometre-level precision and are sufficient for
 * Marketplace-style 5/10/25/50 km discovery without exposing a precise home.
 */
export function coarseCoordinate(value: number) {
  return Math.round(value * 100) / 100;
}

export function toApproxLocation(latitude: number, longitude: number, source: ApproxLocationSource = 'device'): ApproxLocation | null {
  if (!validCoordinate(latitude, longitude)) return null;
  return {
    latitude: coarseCoordinate(latitude),
    longitude: coarseCoordinate(longitude),
    captured_at: new Date().toISOString(),
    source,
  };
}

export function getCachedApproxLocation(maxAgeMs = 6 * 60 * 60_000): ApproxLocation | null {
  try {
    const raw = localStorage.getItem(LOCATION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ApproxLocation;
    if (!validCoordinate(parsed.latitude, parsed.longitude)) return null;
    const age = Date.now() - Date.parse(parsed.captured_at || '');
    if (!Number.isFinite(age) || age < 0 || age > maxAgeMs) return null;
    return { ...parsed, source: 'cache' };
  } catch { return null; }
}

export function saveApproxLocation(location: ApproxLocation) {
  try { localStorage.setItem(LOCATION_KEY, JSON.stringify(location)); } catch { /* optional cache */ }
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent<ApproxLocation>(NEARBY_LOCATION_EVENT, { detail: location }));
}

export function requestApproxLocation(options: { timeoutMs?: number; maximumAgeMs?: number } = {}) {
  return new Promise<ApproxLocation | null>((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const location = toApproxLocation(position.coords.latitude, position.coords.longitude, 'device');
        if (location) saveApproxLocation(location);
        resolve(location);
      },
      () => resolve(null),
      {
        enableHighAccuracy: false,
        timeout: options.timeoutMs ?? 8000,
        maximumAge: options.maximumAgeMs ?? 10 * 60_000,
      },
    );
  });
}

export function geoCellForLocation(location: Pick<ApproxLocation, 'latitude' | 'longitude'>) {
  if (!validCoordinate(location.latitude, location.longitude)) return null;
  const latIndex = Math.floor((location.latitude + 90) / GEO_CELL_DEGREES);
  const lonIndex = Math.floor((location.longitude + 180) / GEO_CELL_DEGREES);
  return `g1:${latIndex}:${lonIndex}`;
}

export function nearbyGeoCells(location: Pick<ApproxLocation, 'latitude' | 'longitude'>) {
  const center = geoCellForLocation(location);
  if (!center) return [];
  const [, rawLat, rawLon] = center.split(':');
  const lat = Number(rawLat);
  const lon = Number(rawLon);
  const cells: string[] = [];
  for (let latOffset = -1; latOffset <= 1; latOffset += 1) {
    for (let lonOffset = -1; lonOffset <= 1; lonOffset += 1) {
      cells.push(`g1:${lat + latOffset}:${lon + lonOffset}`);
    }
  }
  return cells;
}

export function locationAttributes(location: ApproxLocation | null) {
  if (!location) return {};
  const geoCell = geoCellForLocation(location);
  return {
    approx_latitude: location.latitude,
    approx_longitude: location.longitude,
    ...(geoCell ? { geo_cell: geoCell } : {}),
  };
}

function productCoordinates(product: Pick<Product, 'attributes'>) {
  const latitude = Number(product.attributes?.approx_latitude);
  const longitude = Number(product.attributes?.approx_longitude);
  return validCoordinate(latitude, longitude) ? { latitude, longitude } : null;
}

export function haversineDistanceKm(a: Pick<ApproxLocation, 'latitude' | 'longitude'>, b: { latitude: number; longitude: number }) {
  if (!validCoordinate(a.latitude, a.longitude) || !validCoordinate(b.latitude, b.longitude)) return null;
  const toRad = (value: number) => value * Math.PI / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function productDistanceKm(location: ApproxLocation | null, product: Pick<Product, 'attributes'>) {
  const coordinates = productCoordinates(product);
  if (!location || !coordinates) return null;
  return haversineDistanceKm(location, coordinates);
}

export function withinRadius(location: ApproxLocation | null, product: Pick<Product, 'attributes'>, radiusKm: number) {
  const distance = productDistanceKm(location, product);
  return distance === null ? null : distance <= radiusKm;
}
