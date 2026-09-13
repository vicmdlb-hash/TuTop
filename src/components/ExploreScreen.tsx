import { useEffect, useMemo, useState } from 'react';
import { Compass, Heart, MapPin, Search, SlidersHorizontal } from 'lucide-react';
import { MARKETPLACE_CATEGORIES } from '../lib/productAssistant';
import { NEARBY_LOCATION_EVENT, getCachedApproxLocation, productDistanceKm, requestApproxLocation, type ApproxLocation } from '../lib/nearbyMarketplace';
import { useAppStore } from '../store/useAppStore';
import type { ProductCategory } from '../types';
import ProductCard from './ProductCard';

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

  useEffect(() => {
    const onLocation = (event: Event) => {
      const detail = (event as CustomEvent<ApproxLocation>).detail;
      if (detail) setLocation(detail);
    };
    window.addEventListener(NEARBY_LOCATION_EVENT, onLocation);
    return () => window.removeEventListener(NEARBY_LOCATION_EVENT, onLocation);
  }, []);

  const visibleCategories = useMemo(() => {
    const present = new Set(products.map((product) => product.categoria));
    return MARKETPLACE_CATEGORIES.filter((item) => present.has(item)).slice(0, 10);
  }, [products]);

  const filtered = useMemo(() => {
    const cleanQuery = normalized(query.trim());
    return products
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
  }, [products, category, query, scope, favorites, location, radiusKm]);

  const activateNearby = async () => {
    if (locationBusy) return;
    setLocationBusy(true);
    try {
      const next = await requestApproxLocation({ requestPermission: true, timeoutMs: 15_000, maximumAgeMs: 10 * 60_000 });
      if (next) {
        setLocation(next);
        setScope('nearby');
      }
    } finally {
      setLocationBusy(false);
    }
  };

  return (
    <div className="pb-5">
      <header className="page-pad pt-safe pb-3">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-violet-500/10 text-violet-300"><Compass className="h-5 w-5" /></div>
          <div className="min-w-0 flex-1">
            <p className="eyebrow">EXPLORAR</p>
            <h1 className="mt-1 text-xl font-black tracking-tight">Encuentra algo cerca de ti</h1>
            <p className="mt-1 text-[10px] text-slate-500">Busca por producto, categoría o vendedor. La cercanía usa sólo ubicación aproximada.</p>
          </div>
        </div>

        <div className="relative mt-4">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value.slice(0, 120))}
            className="publish-input pl-10"
            placeholder="Buscar en TuTop"
            aria-label="Buscar productos"
          />
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2" aria-label="Filtros rápidos">
          <button type="button" onClick={() => setScope('all')} className={`filter-chip justify-center ${scope === 'all' ? 'filter-chip-active' : ''}`}><SlidersHorizontal className="h-3.5 w-3.5" />Todo</button>
          <button type="button" onClick={() => location ? setScope('nearby') : void activateNearby()} className={`filter-chip justify-center ${scope === 'nearby' ? 'filter-chip-active' : ''}`}><MapPin className="h-3.5 w-3.5" />{locationBusy ? 'Activando…' : 'Cerca'}</button>
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
          <strong className="text-xs">{filtered.length.toLocaleString('es-MX')} resultado{filtered.length === 1 ? '' : 's'}</strong>
          {scope === 'nearby' && <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-[8px] font-black text-emerald-300">≤ {radiusKm} km</span>}
        </div>

        {!location && scope === 'nearby' && (
          <div className="empty-card mb-3">
            <p className="font-bold">Activa ubicación aproximada</p>
            <p className="mt-1 text-[9px] text-slate-500">TuTop nunca necesita tu domicilio exacto para mostrar publicaciones cercanas.</p>
            <button type="button" disabled={locationBusy} onClick={() => void activateNearby()} className="mt-3 rounded-xl bg-violet-600 px-3 py-2 text-[9px] font-black text-white disabled:opacity-50">{locationBusy ? 'Obteniendo ubicación…' : 'Activar cercanía'}</button>
          </div>
        )}

        {filtered.length === 0 ? (
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
