import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { BadgeCheck, Bell, BookmarkPlus, Building2, Clock3, Globe2, Heart, ListFilter, LocateFixed, MapPin, PlusCircle, Search, SlidersHorizontal, Sparkles, Store, X } from 'lucide-react';
import { NEARBY_RADIUS_OPTIONS, getCachedApproxLocation, productDistanceKm, requestApproxLocation, withinRadius, type ApproxLocation } from '../lib/nearbyMarketplace';
import { MARKETPLACE_CATEGORIES, normalizeCategory } from '../lib/productAssistant';
import { parseListingDescription } from '../lib/listingDetails';
import { normalizeSearchText, sortMarketplace } from '../lib/marketplaceCore';
import { defaultScopeForCategory } from '../lib/universityNetwork';
import { nationalBackend, nationalSchemaEnabled } from '../services/nationalBackend';
import { useAppStore } from '../store/useAppStore';
import type { ListingVisibilityScope, Product, User } from '../types';
import ProductCard from './ProductCard';
import NotificationCenter from './NotificationCenter';

const SEARCH_KEY = 'tutop.search-history.v1';
const RECENT_KEY = 'tutop.recent-products.v1';
const SAVED_SEARCH_KEY = 'tutop.saved-searches.local.v1';
const ONBOARDING_INTERESTS_KEY = 'tutop.interests.v1';
type SortMode = 'relevant' | 'recent' | 'price-low' | 'price-high' | 'popular';
type BrowseScope = 'nearby' | 'for-you' | 'campus' | 'institution' | 'city' | 'national';

const scopeOptions: Array<{ id: BrowseScope; label: string; hint: string; icon: ReactNode }> = [
  { id: 'nearby', label: 'Cerca de ti', hint: 'Por kilómetros', icon: <LocateFixed /> },
  { id: 'for-you', label: 'Para ti', hint: 'Relevancia + intereses', icon: <Sparkles /> },
  { id: 'campus', label: 'Mi campus', hint: 'Tu comunidad', icon: <MapPin /> },
  { id: 'institution', label: 'Mi universidad', hint: 'Todos sus campus', icon: <Building2 /> },
  { id: 'city', label: 'Mi ciudad', hint: 'Comunidad cercana', icon: <MapPin /> },
  { id: 'national', label: 'Todo México', hint: 'Descubrimiento nacional', icon: <Globe2 /> },
];

function readLocalList(key: string, max = 12) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(value) ? value.filter((item) => typeof item === 'string').slice(0, max) as string[] : [];
  } catch { return []; }
}

function userInstitution(user: User) { return user.institution_id || user.university?.institution_id; }
function userCampus(user: User) { return user.campus_id || user.university?.campus_id; }
function userCity(user: User) { return user.university?.city_id; }

function sameCampus(product: Product, user: User, legacyFaculty: string) {
  const campus = userCampus(user);
  if (campus) {
    if (product.campus_id) return product.campus_id === campus;
    return Boolean(legacyFaculty && product.facultad === legacyFaculty);
  }
  return Boolean(legacyFaculty && product.facultad === legacyFaculty);
}

function sameInstitution(product: Product, user: User) {
  const institution = userInstitution(user);
  if (!institution) return false;
  return Boolean(product.institution_id && product.institution_id === institution);
}

function sameCity(product: Product, user: User) {
  const city = userCity(user);
  if (!city) return false;
  return Boolean(product.city_id && product.city_id === city);
}

function visibleByPublicationScope(product: Product, user: User, legacyFaculty: string) {
  const scope = product.visibility_scope || defaultScopeForCategory(product.categoria);
  if (scope === 'national') return true;
  if (scope === 'city' || scope === 'university-zone') return sameCity(product, user);
  if (scope === 'institution') return sameInstitution(product, user);
  return sameCampus(product, user, legacyFaculty);
}

function matchesBrowseScope(product: Product, scope: BrowseScope, user: User, legacyFaculty: string, location: ApproxLocation | null, radiusKm: number) {
  if (!visibleByPublicationScope(product, user, legacyFaculty)) return false;
  if (scope === 'nearby') {
    const nearby = withinRadius(location, product, radiusKm);
    if (nearby !== null) return nearby;
    // During rollout, listings without coarse coordinates still remain useful
    // through campus/city identity instead of disappearing from the marketplace.
    return sameCampus(product, user, legacyFaculty) || sameCity(product, user);
  }
  if (scope === 'for-you') return true;
  if (scope === 'campus') return sameCampus(product, user, legacyFaculty);
  if (scope === 'institution') return sameInstitution(product, user);
  if (scope === 'city') return sameCity(product, user);
  return (product.visibility_scope || defaultScopeForCategory(product.categoria)) === 'national';
}

export default function Feed() {
  const { currentFacultad, products, user, notifications, openProduct, favorites, chats, setActiveTab } = useAppStore();
  const [selectedCategoria, setSelectedCategoria] = useState('Todas');
  const [searchOpen, setSearchOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('relevant');
  const [browseScope, setBrowseScope] = useState<BrowseScope>('nearby');
  const [nearbyRadius, setNearbyRadius] = useState<(typeof NEARBY_RADIUS_OPTIONS)[number]>(10);
  const [viewerLocation, setViewerLocation] = useState<ApproxLocation | null>(() => getCachedApproxLocation());
  const [locationStatus, setLocationStatus] = useState<'ready' | 'asking' | 'fallback'>(() => viewerLocation ? 'ready' : 'asking');
  const [maxPrice, setMaxPrice] = useState('');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [negotiableOnly, setNegotiableOnly] = useState(false);
  const [deliveryOnly, setDeliveryOnly] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [searchHistory, setSearchHistory] = useState(() => readLocalList(SEARCH_KEY, 6));
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const recentIds = readLocalList(RECENT_KEY, 12);
  const onboardingInterests = readLocalList(ONBOARDING_INTERESTS_KEY, 8);

  useEffect(() => {
    if (viewerLocation) return;
    let active = true;
    setLocationStatus('asking');
    void requestApproxLocation().then((location) => {
      if (!active) return;
      setViewerLocation(location);
      setLocationStatus(location ? 'ready' : 'fallback');
    });
    return () => { active = false; };
  }, [viewerLocation]);

  const requestLocationAgain = async () => {
    setLocationStatus('asking');
    const location = await requestApproxLocation({ maximumAgeMs: 0 });
    setViewerLocation(location);
    setLocationStatus(location ? 'ready' : 'fallback');
  };

  const scopedProducts = products;
  const unreadNotifications = notifications.filter((notification) => !notification.read).length;
  const activeFilterCount = Number(Boolean(maxPrice)) + Number(favoritesOnly) + Number(verifiedOnly) + Number(negotiableOnly) + Number(deliveryOnly) + Number(sortMode !== 'relevant');
  const mySellerProducts = scopedProducts.filter((product) => product.vendedor_id === user.id && product.estado === 'Activo');
  const myPublicProducts = mySellerProducts.filter((product) => product.moderation_status === 'approved');
  const myPendingProducts = mySellerProducts.filter((product) => product.moderation_status === 'pending' || product.moderation_status === 'review');
  const sellerUnread = chats.filter((chat) => chat.vendedor_id === user.id).reduce((sum, chat) => sum + (chat.sin_leer || 0), 0);

  const interestCategories = useMemo(() => {
    const counts = new Map<string, number>();
    onboardingInterests.forEach((category) => counts.set(normalizeCategory(category), (counts.get(normalizeCategory(category)) || 0) + 3));
    const ids = new Set([...favorites, ...recentIds]);
    scopedProducts.filter((product) => ids.has(product.id)).forEach((product) => {
      const category = normalizeCategory(product.categoria);
      counts.set(category, (counts.get(category) || 0) + 1);
    });
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([category]) => category);
  }, [scopedProducts, favorites, onboardingInterests.join('|'), recentIds.join('|')]);

  const regularProducts = useMemo(() => {
    const needle = normalizeSearchText(query);
    const priceLimit = Number(maxPrice) || Infinity;
    const list = scopedProducts.filter((product) => {
      const parsed = parseListingDescription(product.descripcion);
      const detailSearch = Object.entries(parsed.details).map(([key, value]) => `${key} ${value}`).join(' ');
      const searchable = normalizeSearchText(`${product.titulo} ${parsed.body} ${detailSearch} ${normalizeCategory(product.categoria)} ${product.vendedor_nombre} ${product.vendedor_handle || ''} ${product.facultad} ${product.city_name || ''}`);
      const matchesQuery = !needle || needle.split(' ').every((token) => searchable.includes(token));
      const matchesStatus = product.estado === 'Activo' || product.estado === 'Reservado';
      const matchesCategory = selectedCategoria === 'Todas' || normalizeCategory(product.categoria) === selectedCategoria;
      const matchesFavorite = !favoritesOnly || favorites.includes(product.id);
      const matchesVerified = !verifiedOnly || product.vendedor_verificado === true;
      const matchesNegotiable = !negotiableOnly || product.precio_negociable === true || parsed.details['Precio negociable']?.toLowerCase() === 'sí';
      const matchesDelivery = !deliveryOnly || Boolean(product.metodos_entrega?.length || parsed.details['Entrega'] || parsed.details['Horario'] || parsed.details['Disponibilidad']);
      return matchesBrowseScope(product, browseScope, user, currentFacultad, viewerLocation, nearbyRadius) && matchesStatus && matchesCategory && matchesQuery && matchesFavorite && matchesVerified && matchesNegotiable && matchesDelivery && product.precio_mxn <= priceLimit;
    });
    if (sortMode === 'price-low') return list.sort((a, b) => a.precio_mxn - b.precio_mxn);
    if (sortMode === 'price-high') return list.sort((a, b) => b.precio_mxn - a.precio_mxn);
    if (sortMode === 'popular') return list.sort((a, b) => (b.likes || 0) - (a.likes || 0) || Number(b.es_top) - Number(a.es_top));
    if (sortMode === 'recent') return list.sort((a, b) => Date.parse(b.fecha_creacion) - Date.parse(a.fecha_creacion));
    if (browseScope === 'nearby' && viewerLocation) {
      return list.sort((a, b) => (productDistanceKm(viewerLocation, a) ?? Number.POSITIVE_INFINITY) - (productDistanceKm(viewerLocation, b) ?? Number.POSITIVE_INFINITY));
    }
    return sortMarketplace(list, { query, user, favoriteCategories: interestCategories });
  }, [scopedProducts, currentFacultad, selectedCategoria, query, sortMode, maxPrice, favoritesOnly, verifiedOnly, negotiableOnly, deliveryOnly, favorites, browseScope, user, interestCategories, viewerLocation, nearbyRadius]);

  const topProducts = useMemo(() => regularProducts.filter((product) => product.es_top).sort((a, b) => a.jerarquia_top - b.jerarquia_top).slice(0, 3), [regularProducts]);
  const recentProducts = useMemo(() => recentIds.map((id) => scopedProducts.find((product) => product.id === id)).filter((product): product is Product => Boolean(product && product.estado === 'Activo' && visibleByPublicationScope(product, user, currentFacultad))).slice(0, 4), [scopedProducts, user, currentFacultad, recentIds.join('|')]);

  const clearFilters = () => { setSortMode('relevant'); setMaxPrice(''); setFavoritesOnly(false); setVerifiedOnly(false); setNegotiableOnly(false); setDeliveryOnly(false); };

  const rememberSearch = (value: string) => {
    const clean = value.trim();
    if (clean.length < 2) return;
    const next = [clean, ...searchHistory.filter((item) => normalizeSearchText(item) !== normalizeSearchText(clean))].slice(0, 6);
    setSearchHistory(next);
    try { localStorage.setItem(SEARCH_KEY, JSON.stringify(next)); } catch { /* optional */ }
  };

  const saveCurrentSearch = async () => {
    const clean = query.trim();
    if (!clean) return;
    const visibility: ListingVisibilityScope = browseScope === 'national' ? 'national' : browseScope === 'institution' ? 'institution' : browseScope === 'city' || browseScope === 'nearby' ? 'city' : 'campus';
    const payload = { query: clean, category: selectedCategoria === 'Todas' ? undefined : normalizeCategory(selectedCategoria), max_price_mxn: maxPrice ? Number(maxPrice) : undefined, institution_id: userInstitution(user), campus_id: userCampus(user), visibility_scope: visibility, notifications_enabled: true } as const;
    try {
      if (nationalSchemaEnabled()) await nationalBackend.saveSearch(payload);
      else {
        const existing = JSON.parse(localStorage.getItem(SAVED_SEARCH_KEY) || '[]');
        const next = [{ id: `local-${Date.now()}`, ...payload, created_at: new Date().toISOString() }, ...(Array.isArray(existing) ? existing : [])].slice(0, 20);
        localStorage.setItem(SAVED_SEARCH_KEY, JSON.stringify(next));
      }
      setSavedMessage(nationalSchemaEnabled() ? 'Búsqueda guardada · alertas V2 activas' : 'Búsqueda guardada en este dispositivo');
      window.setTimeout(() => setSavedMessage(null), 2600);
    } catch { setSavedMessage('No pudimos guardar la búsqueda.'); }
  };

  const identityLabel = user.university?.campus_name || user.university?.institution_name || user.facultad;

  return (
    <div className="page-pad">
      <header className="pt-safe flex items-center justify-between pb-4"><div><div className="wordmark"><span>Tu</span><span>Top</span></div><p className="mt-0.5 text-[11px] text-muted">Tu red universitaria para comprar, vender y encontrar.</p></div><div className="flex items-center gap-2"><div className="coin-pill"><span className="coin-dot">T</span><strong>{user.saldo_ucoins}</strong><span>UCoins</span></div><button onClick={() => setNotificationsOpen(true)} className="icon-button-lg relative" aria-label="Notificaciones"><Bell className="h-5 w-5" />{unreadNotifications > 0 && <span className="nav-badge -right-1 -top-1">{unreadNotifications}</span>}</button></div></header>

      <section className="rounded-2xl border border-violet-400/10 bg-violet-500/[0.04] p-2.5"><div className="mb-2 flex items-center gap-2 px-1"><MapPin className="h-3.5 w-3.5 text-violet-300" /><p className="min-w-0 flex-1 truncate text-[9px] text-slate-500">{locationStatus === 'ready' ? <><strong className="text-emerald-300">Cerca de ti activo</strong> · ubicación aproximada</> : locationStatus === 'asking' ? 'Calculando cercanía…' : <>Sin ubicación · usando <strong className="text-slate-300">{identityLabel}</strong></>}</p>{locationStatus !== 'ready' && <button onClick={() => void requestLocationAgain()} className="rounded-lg bg-violet-500/10 px-2 py-1 text-[8px] font-bold text-violet-300">Activar ubicación</button>}</div><div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">{scopeOptions.map((scope) => <button key={scope.id} onClick={() => setBrowseScope(scope.id)} className={`min-w-[116px] rounded-xl px-3 py-2 text-left transition ${browseScope === scope.id ? 'bg-violet-600/25 text-violet-100 ring-1 ring-violet-400/20' : 'bg-white/[0.025] text-slate-500'}`}><strong className="flex items-center gap-1.5 text-[10px] [&>svg]:h-3.5 [&>svg]:w-3.5">{scope.icon}{scope.label}</strong><span className="mt-0.5 block text-[8px] opacity-70">{scope.hint}</span></button>)}</div>{browseScope === 'nearby' && <div className="mt-2 flex items-center gap-1.5 overflow-x-auto"><span className="mr-1 text-[8px] font-bold uppercase tracking-wider text-slate-600">Radio</span>{NEARBY_RADIUS_OPTIONS.map((radius) => <button key={radius} onClick={() => setNearbyRadius(radius)} className={`rounded-full px-3 py-1.5 text-[9px] font-bold ${nearbyRadius === radius ? 'bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-400/20' : 'bg-white/[0.035] text-slate-500'}`}>{radius} km</button>)}</div>}</section>

      {mySellerProducts.length > 0 && <section className="mt-3 rounded-2xl border border-violet-400/10 bg-gradient-to-r from-violet-500/[0.08] to-fuchsia-500/[0.04] p-3"><div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-violet-500/15 text-violet-200"><Store className="h-5 w-5" /></div><div className="min-w-0 flex-1"><p className="text-[9px] font-bold uppercase tracking-[0.14em] text-violet-300">Modo vendedor</p><h2 className="mt-0.5 text-xs font-black">{myPublicProducts.length} {myPublicProducts.length === 1 ? 'publicación visible' : 'publicaciones visibles'}{myPendingProducts.length ? ` · ${myPendingProducts.length} en revisión` : ''}</h2><p className="mt-0.5 text-[9px] text-slate-500">{myPendingProducts.length ? 'Las publicaciones en revisión todavía no son visibles para otros usuarios.' : sellerUnread ? `${sellerUnread} mensaje${sellerUnread === 1 ? '' : 's'} pendiente${sellerUnread === 1 ? '' : 's'}` : 'Todo al día por ahora'}</p></div><button onClick={() => setActiveTab('bot')} className="rounded-xl bg-violet-600 px-3 py-2 text-[9px] font-black text-white"><PlusCircle className="mx-auto mb-1 h-4 w-4" />Vender</button></div></section>}

      {topProducts.length > 0 && <section className="mt-5"><div className="mb-2.5 flex items-center justify-between"><h2 className="section-title">Top en este alcance</h2><span className="text-[9px] text-slate-600">Ranking contextual</span></div><div className="grid grid-cols-3 gap-2">{topProducts.map((product) => <button key={product.id} onClick={() => openProduct(product.id)} className={`top-mini top-mini-${product.jerarquia_top} text-left`}><div className="relative aspect-square overflow-hidden rounded-[13px]"><img src={product.imagen_url} alt={product.titulo} className="h-full w-full object-cover" /><span className="top-rank">#{product.jerarquia_top}</span></div><h3 className="mt-2 line-clamp-2 text-[11px] font-bold leading-tight">{product.titulo}</h3></button>)}</div></section>}

      {recentProducts.length > 0 && <section className="mt-5"><div className="mb-2.5 flex items-center gap-2"><Clock3 className="h-4 w-4 text-slate-500" /><h2 className="section-title">Vistos recientemente</h2></div><div className="flex gap-2 overflow-x-auto pb-1">{recentProducts.map((product) => <button key={product.id} onClick={() => openProduct(product.id)} className="min-w-[132px] overflow-hidden rounded-2xl border border-white/5 bg-white/[0.025] text-left"><img src={product.imagen_url} alt={product.titulo} className="aspect-[4/3] w-full object-cover" /><div className="p-2"><p className="line-clamp-1 text-[10px] font-bold">{product.titulo}</p><p className="mt-1 text-[10px] font-black text-emerald-300">${product.precio_mxn.toLocaleString('es-MX')}</p></div></button>)}</div></section>}

      <section className="mt-5"><div className="mb-2.5 flex items-center justify-between"><div><h2 className="section-title">{browseScope === 'nearby' ? `A menos de ${nearbyRadius} km` : 'Explora'}</h2><p className="mt-0.5 text-[9px] text-slate-600">{regularProducts.length} {regularProducts.length === 1 ? 'publicación visible' : 'publicaciones visibles'} en este alcance</p></div><div className="flex gap-1"><button onClick={() => setSearchOpen((value) => !value)} className={`icon-button ${searchOpen || query ? 'text-violet-300' : ''}`} aria-label="Buscar"><Search className="h-5 w-5" /></button><button onClick={() => setFiltersOpen((value) => !value)} className={`icon-button relative ${filtersOpen || activeFilterCount ? 'text-violet-300' : ''}`} aria-label="Filtros"><SlidersHorizontal className="h-5 w-5" />{activeFilterCount > 0 && <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-violet-500 px-1 text-[8px] font-black text-white">{activeFilterCount}</span>}</button></div></div>
        <AnimatePresence>{searchOpen && <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mb-3 overflow-hidden"><div className="search-field"><Search /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') rememberSearch(query); }} placeholder="iPhone 13, apuntes micro, calculadora…" /><button onClick={() => { setQuery(''); setSearchOpen(false); }} aria-label="Cerrar búsqueda"><X /></button></div>{query ? <div className="mt-2 flex items-center justify-between gap-2"><p className="px-1 text-[9px] text-slate-600">Busca tolerando acentos y variaciones sencillas.</p><button onClick={() => void saveCurrentSearch()} className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-violet-500/10 px-2.5 py-1.5 text-[9px] font-bold text-violet-300"><BookmarkPlus className="h-3.5 w-3.5" />Guardar alerta</button></div> : searchHistory.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{searchHistory.map((item) => <button key={item} onClick={() => setQuery(item)} className="rounded-full bg-white/[0.035] px-2.5 py-1.5 text-[9px] text-slate-400">{item}</button>)}</div>}{savedMessage && <p className="mt-2 rounded-xl bg-emerald-500/10 px-3 py-2 text-[9px] text-emerald-300">{savedMessage}</p>}</motion.div>}</AnimatePresence>
        <AnimatePresence>{filtersOpen && <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mb-3 overflow-hidden"><div className="filter-panel"><div><label>Ordenar</label><select value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)}><option value="relevant">Más relevantes</option><option value="recent">Más recientes</option><option value="popular">Más populares</option><option value="price-low">Precio: menor a mayor</option><option value="price-high">Precio: mayor a menor</option></select></div><div><label>Precio máximo</label><input value={maxPrice} onChange={(event) => setMaxPrice(event.target.value)} inputMode="numeric" type="number" min="0" placeholder="Sin límite" /></div><div className="col-span-2 grid grid-cols-2 gap-2"><FilterToggle active={favoritesOnly} onClick={() => setFavoritesOnly((value) => !value)} icon={<Heart />} label="Guardados" /><FilterToggle active={verifiedOnly} onClick={() => setVerifiedOnly((value) => !value)} icon={<BadgeCheck />} label="Verificados" /><FilterToggle active={negotiableOnly} onClick={() => setNegotiableOnly((value) => !value)} label="Negociable" /><FilterToggle active={deliveryOnly} onClick={() => setDeliveryOnly((value) => !value)} label="Entrega definida" /></div><button onClick={clearFilters}><ListFilter />Limpiar filtros</button></div></motion.div>}</AnimatePresence><div className="chips-row">{['Todas', ...MARKETPLACE_CATEGORIES].map((categoria) => <button key={categoria} onClick={() => setSelectedCategoria(categoria)} className={`filter-chip ${selectedCategoria === categoria ? 'filter-chip-active' : ''}`}>{categoria}</button>)}</div></section>

      <section className="mt-3 space-y-3 pb-3">{regularProducts.length ? regularProducts.map((product, index) => <motion.div key={product.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index * 0.025, 0.14) }}><ProductCard product={product} /></motion.div>) : <div className="empty-card"><strong className="block text-slate-300">Todavía no encontramos algo aquí.</strong><span className="mt-1 block">{browseScope === 'nearby' ? 'Amplía el radio, activa ubicación o cambia de alcance.' : 'Prueba otro alcance, cambia categoría o publica un “Busco…” para que la demanda quede visible.'}</span>{activeFilterCount > 0 && <button onClick={clearFilters} className="mt-3 rounded-xl bg-white/[0.06] px-3 py-2 text-[10px] font-bold text-slate-300">Limpiar filtros</button>}</div>}</section>
      <AnimatePresence>{notificationsOpen && <NotificationCenter onClose={() => setNotificationsOpen(false)} />}</AnimatePresence>
    </div>
  );
}

function FilterToggle({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon?: ReactNode; label: string }) {
  return <button type="button" onClick={onClick} className={`!justify-center ${active ? '!border-violet-400/20 !bg-violet-500/10 !text-violet-200' : ''}`}>{icon && <span className="[&>svg]:h-4 [&>svg]:w-4">{icon}</span>}{label}</button>;
}
