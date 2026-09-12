import type { Product } from '../types';

export type ApproxLocationSource = 'device' | 'cache' | 'campus';
export type ApproxLocation = {
  latitude: number;
  longitude: number;
  captured_at: string;
  source: ApproxLocationSource;
};

const LOCATION_KEY = 'tutop.approx-location.v1';
export const NEARBY_RADIUS_OPTIONS = [5, 10, 25, 50] as const;

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

export function productDistanceKm(location: ApproxLocation | null, product: Pick<Product, 'approx_latitude' | 'approx_longitude'>) {
  if (!location || product.approx_latitude === undefined || product.approx_longitude === undefined) return null;
  return haversineDistanceKm(location, { latitude: product.approx_latitude, longitude: product.approx_longitude });
}

export function withinRadius(location: ApproxLocation | null, product: Pick<Product, 'approx_latitude' | 'approx_longitude'>, radiusKm: number) {
  const distance = productDistanceKm(location, product);
  return distance === null ? null : distance <= radiusKm;
}
