import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { BadgeCheck, Bell, ChevronDown, Clock3, Crown, Heart, ListFilter, MapPin, PlusCircle, Search, SlidersHorizontal, Sparkles, Store, Trophy, X } from 'lucide-react';
import { MARKETPLACE_CATEGORIES, normalizeCategory } from '../lib/productAssistant';
import { parseListingDescription } from '../lib/listingDetails';
import { useAppStore } from '../store/useAppStore';
import ProductCard from './ProductCard';
import NotificationCenter from './NotificationCenter';

const facultades = ['Turismo Internacional', 'Odontología', 'Ciencias Económico Administrativas', 'Derecho', 'Medicina'];
const SEARCH_KEY = 'tutop.search-history.v1';
const RECENT_KEY = 'tutop.recent-products.v1';
type SortMode = 'recent' | 'price-low' | 'price-high' | 'popular';
type FeedScope = 'for-you' | 'all';

function readLocalList(key: string) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(value) ? value.filter((item) => typeof item === 'string').slice(0, 12) as string[] : [];
  } catch { return []; }
}

export default function Feed() {
  const { currentFacultad, setCurrentFacultad, products, user, notifications, openProduct, favorites, chats, setActiveTab } = useAppStore();
  const [selectedCategoria, setSelectedCategoria] = useState('Todas');
  const [showFacultadDropdown, setShowFacultadDropdown] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('recent');
  const [feedScope, setFeedScope] = useState<FeedScope>('for-you');
  const [maxPrice, setMaxPrice] = useState('');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [negotiableOnly, setNegotiableOnly] = useState(false);
  const [deliveryOnly, setDeliveryOnly] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [searchHistory, setSearchHistory] = useState(() => readLocalList(SEARCH_KEY));
  const recentIds = readLocalList(RECENT_KEY);
  const unreadNotifications = notifications.filter((notification) => !notification.read).length;
  const activeFilterCount = Number(Boolean(maxPrice)) + Number(favoritesOnly) + Number(verifiedOnly) + Number(negotiableOnly) + Number(deliveryOnly) + Number(sortMode !== 'recent');
  const myActiveProducts = products.filter((product) => product.vendedor_id === user.id && product.estado === 'Activo');
  const sellerUnread = chats.filter((chat) => chat.vendedor_id === user.id).reduce((sum, chat) => sum + (chat.sin_leer || 0), 0);

  const topProducts = useMemo(() => products
    .filter((product) => product.es_top && product.estado === 'Activo' && product.facultad === currentFacultad)
    .sort((a, b) => a.jerarquia_top - b.jerarquia_top)
    .slice(0, 3), [products, currentFacultad]);

  const interestCategories = useMemo(() => {
    const ids = new Set([...favorites, ...recentIds]);
    const counts = new Map<string, number>();
    products.filter((product) => ids.has(product.id)).forEach((product) => {
      const category = normalizeCategory(product.categoria);
      counts.set(category, (counts.get(category) || 0) + 1);
    });
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([category]) => category);
  }, [products, favorites, recentIds.join('|')]);

  const regularProducts = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('es-MX');
    const priceLimit = Number(maxPrice) || Infinity;
    const list = products.filter((product) => {
      const parsed = parseListingDescription(product.descripcion);
      const detailSearch = Object.entries(parsed.details).map(([key, value]) => `${key} ${value}`).join(' ');
      const searchable = `${product.titulo} ${parsed.body} ${detailSearch} ${normalizeCategory(product.categoria)} ${product.vendedor_nombre} ${product.vendedor_handle || ''} ${product.facultad}`.toLocaleLowerCase('es-MX');
      const matchesFaculty = feedScope === 'all' || product.facultad === currentFacultad;
      const matchesStatus = product.estado === 'Activo';
      const matchesCategory = selectedCategoria === 'Todas' || normalizeCategory(product.categoria) === selectedCategoria;
      const matchesQuery = !needle || searchable.includes(needle);
      const matchesFavorite = !favoritesOnly || favorites.includes(product.id);
      const matchesVerified = !verifiedOnly || product.vendedor_verificado === true;
      const matchesNegotiable = !negotiableOnly || parsed.details['Precio negociable']?.toLowerCase() === 'sí';
      const matchesDelivery = !deliveryOnly || Boolean(parsed.details['Entrega'] || parsed.details['Horario'] || parsed.details['Disponibilidad']);
      return matchesFaculty && matchesStatus && matchesCategory && matchesQuery && matchesFavorite && matchesVerified && matchesNegotiable && matchesDelivery && product.precio_mxn <= priceLimit;
    });
    if (sortMode === 'price-low') return list.sort((a, b) => a.precio_mxn - b.precio_mxn);
    if (sortMode === 'price-high') return list.sort((a, b) => b.precio_mxn - a.precio_mxn);
    if (sortMode === 'popular') return list.sort((a, b) => (b.likes || 0) - (a.likes || 0) || Number(b.es_top) - Number(a.es_top) || new Date(b.fecha_creacion).getTime() - new Date(a.fecha_creacion).getTime());
    if (feedScope === 'for-you' && interestCategories.length) return list.sort((a, b) => Number(interestCategories.includes(normalizeCategory(b.categoria))) - Number(interestCategories.includes(normalizeCategory(a.categoria))) || Number(b.es_top) - Number(a.es_top) || new Date(b.fecha_creacion).getTime() - new Date(a.fecha_creacion).getTime());
    return list.sort((a, b) => Number(b.es_top) - Number(a.es_top) || new Date(b.fecha_creacion).getTime() - new Date(a.fecha_creacion).getTime());
  }, [products, currentFacultad, selectedCategoria, query, sortMode, maxPrice, favoritesOnly, verifiedOnly, negotiableOnly, deliveryOnly, favorites, feedScope, interestCategories]);

  const recentProducts = useMemo(() => recentIds.map((id) => products.find((product) => product.id === id)).filter((product): product is NonNullable<typeof product> => Boolean(product && product.estado === 'Activo')).slice(0, 4), [products, recentIds.join('|')]);

  const clearFilters = () => {
    setSortMode('recent');
    setMaxPrice('');
    setFavoritesOnly(false);
    setVerifiedOnly(false);
    setNegotiableOnly(false);
    setDeliveryOnly(false);
  };

  const rememberSearch = (value: string) => {
    const clean = value.trim();
    if (clean.length < 2) return;
    const next = [clean, ...searchHistory.filter((item) => item.toLocaleLowerCase('es-MX') !== clean.toLocaleLowerCase('es-MX'))].slice(0, 6);
    setSearchHistory(next);
    try { localStorage.setItem(SEARCH_KEY, JSON.stringify(next)); } catch { /* optional */ }
  };

  return (
    <div className="page-pad">
      <header className="pt-safe flex items-center justify-between pb-4">
        <div><div className="wordmark"><span>Tu</span><span>Top</span></div><p className="mt-0.5 text-[11px] text-muted">El mercado de tu comunidad universitaria.</p></div>
        <div className="flex items-center gap-2"><div className="coin-pill"><span className="coin-dot">T</span><strong>{user.saldo_ucoins}</strong><span>UCoins</span></div><button onClick={() => setNotificationsOpen(true)} className="icon-button-lg relative" aria-label="Notificaciones"><Bell className="h-5 w-5" />{unreadNotifications > 0 && <span className="nav-badge -right-1 -top-1">{unreadNotifications}</span>}</button></div>
      </header>

      <div className="grid grid-cols-2 gap-2 rounded-2xl bg-white/[0.035] p-1.5">
        <button onClick={() => setFeedScope('for-you')} className={`rounded-xl px-3 py-2.5 text-left ${feedScope === 'for-you' ? 'bg-violet-600/20 text-violet-100' : 'text-slate-500'}`}><strong className="flex items-center gap-1.5 text-[11px]"><Sparkles className="h-3.5 w-3.5" />Para ti</strong><span className="mt-0.5 block text-[8px]">Tu facultad + tus intereses.</span></button>
        <button onClick={() => setFeedScope('all')} className={`rounded-xl px-3 py-2.5 text-left ${feedScope === 'all' ? 'bg-violet-600/20 text-violet-100' : 'text-slate-500'}`}><strong className="block text-[11px]">Ver todo</strong><span className="mt-0.5 block text-[8px]">Explora toda la comunidad.</span></button>
      </div>

      {myActiveProducts.length > 0 && <section className="mt-3 rounded-2xl border border-violet-400/10 bg-gradient-to-r from-violet-500/[0.08] to-fuchsia-500/[0.04] p-3"><div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-violet-500/15 text-violet-200"><Store className="h-5 w-5" /></div><div className="min-w-0 flex-1"><p className="text-[9px] font-bold uppercase tracking-[0.14em] text-violet-300">Modo vendedor</p><h2 className="mt-0.5 text-xs font-black">{myActiveProducts.length} {myActiveProducts.length === 1 ? 'publicación activa' : 'publicaciones activas'}</h2><p className="mt-0.5 text-[9px] text-slate-500">{sellerUnread ? `${sellerUnread} mensaje${sellerUnread === 1 ? '' : 's'} pendiente${sellerUnread === 1 ? '' : 's'}` : 'Todo al día por ahora'}</p></div><button onClick={() => setActiveTab('bot')} className="rounded-xl bg-violet-600 px-3 py-2 text-[9px] font-black text-white"><PlusCircle className="mx-auto mb-1 h-4 w-4" />Vender</button></div></section>}

      {feedScope === 'for-you' && <div className="relative mb-3 mt-3">
        <button onClick={() => setShowFacultadDropdown((value) => !value)} className="faculty-selector"><span className="flex min-w-0 items-center gap-2"><MapPin className="h-4 w-4 text-[#38BDF8]" /><span className="truncate">Facultad de {currentFacultad}</span></span><ChevronDown className={`h-4 w-4 transition ${showFacultadDropdown ? 'rotate-180' : ''}`} /></button>
        {showFacultadDropdown && <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="dropdown-panel">{facultades.map((facultad) => <button key={facultad} onClick={() => { setCurrentFacultad(facultad); setShowFacultadDropdown(false); }}>{facultad}</button>)}</motion.div>}
      </div>}

      <section className="auction-banner mt-3">
        <div className="relative z-10 max-w-[62%]"><div className="flex items-center gap-2"><Trophy className="h-4 w-4 text-[#FBBF24]" /><span className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#E9D5FF]">Top semanal</span></div><h2 className="mt-2 text-[18px] font-extrabold leading-tight">Lo que más destaca ahora.</h2><p className="mt-1 text-[11px] text-[#C4B5FD]">Top 1 · Top 2 · Top 3 por facultad</p><button disabled={!topProducts.length} onClick={() => document.getElementById('top-semana')?.scrollIntoView({ behavior: 'smooth', block: 'start' })} className="mt-3 rounded-full bg-white px-3 py-1.5 text-[11px] font-extrabold text-[#4C1D95] disabled:cursor-not-allowed disabled:opacity-45">{topProducts.length ? 'Ver ranking →' : 'Aún sin ranking'}</button></div>
        <div className="podium" aria-hidden="true"><span className="podium-two">2</span><span className="podium-one"><Crown className="h-5 w-5" />1</span><span className="podium-three">3</span></div>
      </section>

      {topProducts.length > 0 && <section id="top-semana" className="mt-5 scroll-mt-4"><div className="mb-2.5 flex items-center justify-between"><h2 className="section-title">Top de la semana</h2><span className="text-[10px] text-muted">Se actualiza por pujas</span></div><div className="grid grid-cols-3 gap-2">{topProducts.map((product) => <button key={product.id} onClick={() => openProduct(product.id)} className={`top-mini top-mini-${product.jerarquia_top} text-left`}><div className="relative aspect-square overflow-hidden rounded-[13px]"><img src={product.imagen_url} alt={product.titulo} className="h-full w-full object-cover" /><span className="top-rank">#{product.jerarquia_top}</span></div><h3 className="mt-2 line-clamp-2 text-[11px] font-bold leading-tight">{product.titulo}</h3><p className="mt-1 text-[10px] text-muted">{product.puja_ucoins || 0} UCoins</p></button>)}</div></section>}

      {recentProducts.length > 0 && <section className="mt-5"><div className="mb-2.5 flex items-center gap-2"><Clock3 className="h-4 w-4 text-slate-500" /><h2 className="section-title">Vistos recientemente</h2></div><div className="flex gap-2 overflow-x-auto pb-1">{recentProducts.map((product) => <button key={product.id} onClick={() => openProduct(product.id)} className="min-w-[132px] overflow-hidden rounded-2xl border border-white/5 bg-white/[0.025] text-left"><img src={product.imagen_url} alt={product.titulo} className="aspect-[4/3] w-full object-cover" /><div className="p-2"><p className="line-clamp-1 text-[10px] font-bold">{product.titulo}</p><p className="mt-1 text-[10px] font-black text-emerald-300">${product.precio_mxn.toLocaleString('es-MX')}</p></div></button>)}</div></section>}

      <section className="mt-5">
        <div className="mb-2.5 flex items-center justify-between"><div><h2 className="section-title">Explora</h2><p className="mt-0.5 text-[9px] text-slate-600">{regularProducts.length} {regularProducts.length === 1 ? 'publicación' : 'publicaciones'} {feedScope === 'for-you' ? 'para ti' : 'en TuTop'}</p></div><div className="flex gap-1"><button onClick={() => setSearchOpen((value) => !value)} className={`icon-button ${searchOpen || query ? 'text-violet-300' : ''}`} aria-label="Buscar"><Search className="h-5 w-5" /></button><button onClick={() => setFiltersOpen((value) => !value)} className={`icon-button relative ${filtersOpen || activeFilterCount ? 'text-violet-300' : ''}`} aria-label="Filtros"><SlidersHorizontal className="h-5 w-5" />{activeFilterCount > 0 && <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-violet-500 px-1 text-[8px] font-black text-white">{activeFilterCount}</span>}</button></div></div>
        <AnimatePresence>{searchOpen && <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mb-3 overflow-hidden"><div className="search-field"><Search /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') rememberSearch(query); }} placeholder="Producto, marca, vendedor, categoría…" /><button onClick={() => { setQuery(''); setSearchOpen(false); }} aria-label="Cerrar búsqueda"><X /></button></div>{query ? <p className="mt-1.5 px-1 text-[9px] text-slate-600">Buscando también en descripción y detalles del anuncio.</p> : searchHistory.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{searchHistory.map((item) => <button key={item} onClick={() => setQuery(item)} className="rounded-full bg-white/[0.035] px-2.5 py-1.5 text-[9px] text-slate-400">{item}</button>)}</div>}</motion.div>}</AnimatePresence>
        <AnimatePresence>{filtersOpen && <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mb-3 overflow-hidden"><div className="filter-panel"><div><label>Ordenar</label><select value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)}><option value="recent">Más recientes</option><option value="popular">Más populares</option><option value="price-low">Precio: menor a mayor</option><option value="price-high">Precio: mayor a menor</option></select></div><div><label>Precio máximo</label><input value={maxPrice} onChange={(event) => setMaxPrice(event.target.value)} inputMode="numeric" type="number" min="0" placeholder="Sin límite" /></div><div className="col-span-2 grid grid-cols-2 gap-2"><FilterToggle active={favoritesOnly} onClick={() => setFavoritesOnly((value) => !value)} icon={<Heart />} label="Guardados" /><FilterToggle active={verifiedOnly} onClick={() => setVerifiedOnly((value) => !value)} icon={<BadgeCheck />} label="Verificados" /><FilterToggle active={negotiableOnly} onClick={() => setNegotiableOnly((value) => !value)} label="Negociable" /><FilterToggle active={deliveryOnly} onClick={() => setDeliveryOnly((value) => !value)} label="Entrega definida" /></div><button onClick={clearFilters}><ListFilter />Limpiar filtros</button></div></motion.div>}</AnimatePresence>
        <div className="chips-row">{['Todas', ...MARKETPLACE_CATEGORIES].map((categoria) => <button key={categoria} onClick={() => setSelectedCategoria(categoria)} className={`filter-chip ${selectedCategoria === categoria ? 'filter-chip-active' : ''}`}>{categoria}</button>)}</div>
      </section>

      <section className="mt-3 space-y-3 pb-3">{regularProducts.length ? regularProducts.map((product, index) => <motion.div key={product.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index * 0.025, 0.14) }}><ProductCard product={product} /></motion.div>) : <div className="empty-card"><strong className="block text-slate-300">No encontramos algo con esos filtros.</strong><span className="mt-1 block">Prueba otra categoría, quita un filtro o busca con menos palabras.</span>{activeFilterCount > 0 && <button onClick={clearFilters} className="mt-3 rounded-xl bg-white/[0.06] px-3 py-2 text-[10px] font-bold text-slate-300">Ver todo de nuevo</button>}</div>}</section>
      <AnimatePresence>{notificationsOpen && <NotificationCenter onClose={() => setNotificationsOpen(false)} />}</AnimatePresence>
    </div>
  );
}

function FilterToggle({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon?: React.ReactNode; label: string }) {
  return <button type="button" onClick={onClick} className={`!justify-center ${active ? '!border-violet-400/20 !bg-violet-500/10 !text-violet-200' : ''}`}>{icon && <span className="[&>svg]:h-4 [&>svg]:w-4">{icon}</span>}{label}</button>;
}
