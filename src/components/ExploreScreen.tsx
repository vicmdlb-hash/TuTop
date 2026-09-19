import { useEffect, useMemo, useState } from 'react';
import { Compass, Heart, Loader2, MapPin, Search, SlidersHorizontal, TriangleAlert } from 'lucide-react';
import { MARKETPLACE_CATEGORIES } from '../lib/productAssistant';
import { NEARBY_LOCATION_EVENT, getCachedApproxLocation, nearbyGeoCells, nearbyLocationPermission, productDistanceKm, requestApproxLocation, type ApproxLocation } from '../lib/nearbyMarketplace';
import { canonicalListingsBackend } from '../services/canonicalListingsBackend';
import { useAppStore } from '../store/useAppStore';
import type { Product, ProductCategory } from '../types';
import ProductCard from './ProductCard';
import { V2_LISTINGS_BASE_HYDRATED_EVENT } from './V2ListingsHydrator';

type ExploreScope = 'all' | 'nearby' | 'favorites';
const RADII = [5, 10, 25, 50] as const;

function normalized(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

export default function ExploreScreen() {
  const products = useAppStore((state) => state.products);
  const favorites = useAppStore((state) => state.favorites);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<ProductCategory | 'Todas'>('Todas');
  const [scope, setScope] = useState<ExploreScope>('all');
  const [radiusKm, setRadiusKm] = useState<(typeof RADII)[number]>(25);
  const [location, setLocation] = useState<ApproxLocation | null>(() => getCachedApproxLocation());
  const [locationBusy, setLocationBusy] = useState(false);
  const [locationMessage, setLocationMessage] = useState<string | null>(null);
  const [nearbyProducts, setNearbyProducts] = useState<Product[]>([]);
  const [nearbyBusy, setNearbyBusy] = useState(false);
  const [nearbyError, setNearbyError] = useState<string | null>(null);
  const [nearbyRefreshKey, setNearbyRefreshKey] = useState(0);

  useEffect(() => {
    const onLocation = (event: Event) => {
      const detail = (event as CustomEvent<ApproxLocation>).detail;
      if (!detail) return;
      setLocation(detail);
      setLocationMessage(null);
    };
    window.addEventListener(NEARBY_LOCATION_EVENT, onLocation);
    return () => window.removeEventListener(NEARBY_LOCATION_EVENT, onLocation);
  }, []);

  useEffect(() => {
    const onBaseHydrated = () => {
      if (scope !== 'nearby') return;
      setNearbyProducts([]);
      setNearbyError(null);
      setNearbyRefreshKey((current) => current + 1);
    };
    window.addEventListener(V2_LISTINGS_BASE_HYDRATED_EVENT, onBaseHydrated);
    return () => window.removeEventListener(V2_LISTINGS_BASE_HYDRATED_EVENT, onBaseHydrated);
  }, [scope]);

  useEffect(() => {
    if (scope !== 'nearby' || !location) return;
    let active = true;
    setNearbyBusy(true);
    setNearbyError(null);
    const cells = nearbyGeoCells(location);
    canonicalListingsBackend.loadNearbyProducts({ geoCells: cells, limitPerCell: 15, force: true })
      .then((items) => { if (active) setNearbyProducts(items); })
      .catch(() => {
        if (!active) return;
        setNearbyProducts([]);
        setNearbyError('No pudimos actualizar las publicaciones cercanas. Revisa tu conexión o vuelve a intentarlo.');
      })
      .finally(() => { if (active) setNearbyBusy(false); });
    return () => { active = false; };
  }, [scope, location?.latitude, location?.longitude, location?.captured_at, nearbyRefreshKey]);

  const sourceProducts = scope === 'nearby' ? nearbyProducts : products;

  const visibleCategories = useMemo(() => {
    const present = new Set(sourceProducts.map((product) => product.categoria));
    return MARKETPLACE_CATEGORIES.filter((item) => present.has(item)).slice(0, 10);
  }, [sourceProducts]);

  const filtered = useMemo(() => {
    const cleanQuery = normalized(query.trim());
    return sourceProducts
      .filter((product) => product.estado === 'Activo')
      .filter((product) => category === 'Todas' || product.categoria === category)
      .filter((product) => {
        if (!cleanQuery) return true;
        return normalized(`${product.titulo} ${product.descripcion} ${product.categoria} ${product.vendedor_nombre}`).includes(cleanQuery);
      })
      .filter((product) => {
        if (scope === 'favorites') return favorites.includes(product.id);
        if (scope === 'nearby') {
          if (!location) return false;
          const distance = productDistanceKm(location, product);
          return distance !== null && distance <= radiusKm;
        }
        return true;
      })
      .sort((a, b) => Date.parse(b.fecha_creacion) - Date.parse(a.fecha_creacion));
  }, [sourceProducts, category, query, scope, favorites, location, radiusKm]);

  const activateNearby = async () => {
    if (locationBusy) return;
    setScope('nearby');
    setLocationBusy(true);
    setLocationMessage(null);
    try {
      const cached = getCachedApproxLocation();
      if (cached) {
        setLocation(cached);
        return;
      }
      const next = await requestApproxLocation({ requestPermission: true, timeoutMs: 15_000, maximumAgeMs: 10 * 60_000 });
      if (next) {
        setLocation(next);
        return;
      }
      const permission = await nearbyLocationPermission();
      if (permission === 'denied') {
        setLocationMessage('Android bloqueó la ubicación para TuTop. Activa ubicación aproximada en los permisos de la app y vuelve a intentarlo.');
      } else if (permission === 'unavailable') {
        setLocationMessage('TuTop no pudo obtener una posición. Comprueba que los servicios de ubicación de Android estén encendidos y vuelve a intentarlo.');
      } else {
        setLocationMessage('El permiso está disponible, pero Android todavía no entregó una posición aproximada. Espera unos segundos y vuelve a intentar.');
      }
    } catch {
      setLocationMessage('No pudimos activar la cercanía esta vez. TuTop seguirá funcionando por campus y ciudad; vuelve a intentarlo cuando tengas mejor señal.');
    } finally {
      setLocationBusy(false);
    }
  };

  const refreshNearby = () => {
    setNearbyError(null);
    setNearbyProducts([]);
    setNearbyRefreshKey((current) => current + 1);
  };

  const selectAll = () => {
    setScope('all');
    setLocationMessage(null);
    setNearbyError(null);
  };

  return (
    <div className="pb-5">
      <header className="page-pad pt-safe pb-3">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-violet-500/10 text-violet-300"><Compass className="h-5 w-5" /></div>
          <div className="min-w-0 flex-1">
            <p className="eyebrow">EXPLORAR</p>
            <h1 className="mt-1 text-xl font-black tracking-tight">Encuentra algo cerca de ti</h1>
            <p className="mt-1 text-[10px] text-slate-500">Busca por producto, categoría o vendedor. La cercanía consulta publicaciones reales usando sólo ubicación aproximada.</p>
          </div>
        </div>

        <div className="relative mt-4">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input value={query} onChange={(event) => setQuery(event.target.value.slice(0, 120))} className="publish-input pl-10" placeholder="Buscar en TuTop" aria-label="Buscar productos" />
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2" aria-label="Filtros rápidos">
          <button type="button" onClick={selectAll} className={`filter-chip justify-center ${scope === 'all' ? 'filter-chip-active' : ''}`}><SlidersHorizontal className="h-3.5 w-3.5" />Todo</button>
          <button type="button" onClick={() => location ? (setLocationMessage(null), setScope('nearby')) : void activateNearby()} className={`filter-chip justify-center ${scope === 'nearby' ? 'filter-chip-active' : ''}`}><MapPin className="h-3.5 w-3.5" />{locationBusy ? 'Activando…' : 'Cerca'}</button>
          <button type="button" onClick={() => setScope('favorites')} className={`filter-chip justify-center ${scope === 'favorites' ? 'filter-chip-active' : ''}`}><Heart className="h-3.5 w-3.5" />Guardados</button>
        </div>

        {scope === 'nearby' && (
          <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-1" aria-label="Radio de cercanía">
            {RADII.map((radius) => <button key={radius} type="button" onClick={() => setRadiusKm(radius)} className={`filter-chip shrink-0 ${radiusKm === radius ? 'filter-chip-active' : ''}`}>{radius} km</button>)}
          </div>
        )}

        <div className="mt-3 flex gap-2 overflow-x-auto pb-1" aria-label="Categorías">
          <button type="button" onClick={() => setCategory('Todas')} className={`filter-chip shrink-0 ${category === 'Todas' ? 'filter-chip-active' : ''}`}>Todas</button>
          {visibleCategories.map((item) => <button key={item} type="button" onClick={() => setCategory(item)} className={`filter-chip shrink-0 ${category === item ? 'filter-chip-active' : ''}`}>{item}</button>)}
        </div>
      </header>

      <section className="page-pad">
        <div className="mb-3 flex items-center justify-between gap-3">
          <strong className="text-xs">{nearbyBusy && scope === 'nearby' ? 'Buscando publicaciones…' : `${filtered.length.toLocaleString('es-MX')} resultado${filtered.length === 1 ? '' : 's'}`}</strong>
          {scope === 'nearby' && <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-[8px] font-black text-emerald-300">≤ {radiusKm} km</span>}
        </div>

        {!location && scope === 'nearby' && (
          <div className="empty-card mb-3">
            <div className="flex items-start gap-2">
              {locationMessage && <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />}
              <div className="min-w-0 flex-1">
                <p className="font-bold">{locationMessage ? 'No pudimos activar cercanía' : 'Activa ubicación aproximada'}</p>
                <p className="mt-1 text-[9px] leading-4 text-slate-500">{locationMessage || 'TuTop nunca necesita tu domicilio exacto para mostrar publicaciones cercanas.'}</p>
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <button type="button" disabled={locationBusy} onClick={() => void activateNearby()} className="flex-1 rounded-xl bg-violet-600 px-3 py-2 text-[9px] font-black text-white disabled:opacity-50">{locationBusy ? 'Obteniendo ubicación…' : 'Volver a intentar'}</button>
              <button type="button" onClick={selectAll} className="rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-2 text-[9px] font-black text-slate-300">Ver todo</button>
            </div>
          </div>
        )}

        {scope === 'nearby' && location && nearbyBusy && <div className="empty-card mb-3 flex items-center justify-center gap-2"><Loader2 className="h-4 w-4 animate-spin text-violet-300" /><p className="text-[10px] text-slate-400">Consultando publicaciones cercanas…</p></div>}

        {scope === 'nearby' && nearbyError && (
          <div className="empty-card mb-3">
            <div className="flex items-start gap-2"><TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" /><div><p className="font-bold">No pudimos actualizar Cerca de ti</p><p className="mt-1 text-[9px] leading-4 text-slate-500">{nearbyError}</p></div></div>
            <button type="button" onClick={refreshNearby} className="mt-3 rounded-xl bg-violet-600 px-3 py-2 text-[9px] font-black text-white">Reintentar</button>
          </div>
        )}

        {scope === 'nearby' && (!location || nearbyBusy || nearbyError) ? null : filtered.length === 0 ? (
          <div className="empty-card">
            <p className="font-bold">No encontramos publicaciones con estos filtros.</p>
            <p className="mt-1 text-[9px] text-slate-500">Prueba otra categoría, aumenta la distancia o vuelve a “Todo”.</p>
          </div>
        ) : (
          <div className="space-y-3">{filtered.map((product) => <ProductCard key={product.id} product={product} />)}</div>
        )}
      </section>
    </div>
  );
}
