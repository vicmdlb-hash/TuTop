import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell, ChevronDown, Crown, MapPin, Search, Trophy, X } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import ProductCard from './ProductCard';
import NotificationCenter from './NotificationCenter';

const facultades = ['Turismo Internacional', 'Odontología', 'Ciencias Económico Administrativas', 'Derecho', 'Medicina'];
const categorias = ['Todas', 'Comida', 'Postres', 'Apuntes & Guías', 'Ropa & Accesorios', 'Servicios', 'Otros'];

export default function Feed() {
  const { currentFacultad, setCurrentFacultad, products, user, notifications, openProduct } = useAppStore();
  const [selectedCategoria, setSelectedCategoria] = useState('Todas');
  const [showFacultadDropdown, setShowFacultadDropdown] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const unreadNotifications = notifications.filter((notification) => !notification.read).length;

  const topProducts = useMemo(() => products
    .filter((product) => product.es_top && product.estado === 'Activo' && product.facultad === currentFacultad)
    .sort((a, b) => a.jerarquia_top - b.jerarquia_top)
    .slice(0, 3), [products, currentFacultad]);

  const regularProducts = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('es-MX');
    return products.filter((product) => {
      const matchesFaculty = product.facultad === currentFacultad;
      const matchesStatus = product.estado === 'Activo';
      const matchesCategory = selectedCategoria === 'Todas' || product.categoria === selectedCategoria;
      const matchesQuery = !needle || `${product.titulo} ${product.descripcion || ''} ${product.categoria}`.toLocaleLowerCase('es-MX').includes(needle);
      return matchesFaculty && matchesStatus && matchesCategory && matchesQuery;
    }).sort((a, b) => Number(b.es_top) - Number(a.es_top) || new Date(b.fecha_creacion).getTime() - new Date(a.fecha_creacion).getTime());
  }, [products, currentFacultad, selectedCategoria, query]);

  return (
    <div className="page-pad">
      <header className="pt-safe flex items-center justify-between pb-4">
        <div>
          <div className="wordmark"><span>Tu</span><span>Top</span></div>
          <p className="mt-0.5 text-[11px] text-muted">Tu producto en el Top</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="coin-pill"><span className="coin-dot">$</span><strong>{user.saldo_ucoins}</strong><span>UCoins</span></div>
          <button onClick={() => setNotificationsOpen(true)} className="icon-button-lg relative" aria-label="Notificaciones"><Bell className="h-5 w-5" />{unreadNotifications > 0 && <span className="nav-badge -right-1 -top-1">{unreadNotifications}</span>}</button>
        </div>
      </header>

      <div className="relative mb-3">
        <button onClick={() => setShowFacultadDropdown((value) => !value)} className="faculty-selector">
          <span className="flex min-w-0 items-center gap-2"><MapPin className="h-4 w-4 text-[#38BDF8]" /><span className="truncate">Facultad de {currentFacultad}</span></span>
          <ChevronDown className={`h-4 w-4 transition ${showFacultadDropdown ? 'rotate-180' : ''}`} />
        </button>
        {showFacultadDropdown && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="dropdown-panel">
            {facultades.map((facultad) => <button key={facultad} onClick={() => { setCurrentFacultad(facultad); setShowFacultadDropdown(false); }}>{facultad}</button>)}
          </motion.div>
        )}
      </div>

      <section className="auction-banner">
        <div className="relative z-10 max-w-[62%]">
          <div className="flex items-center gap-2"><Trophy className="h-4 w-4 text-[#FBBF24]" /><span className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#E9D5FF]">Subasta semanal</span></div>
          <h2 className="mt-2 text-[18px] font-extrabold leading-tight">Haz que tu producto sea imposible de ignorar.</h2>
          <p className="mt-1 text-[11px] text-[#C4B5FD]">Top 1 · Top 2 · Top 3 por facultad</p>
          <button disabled={!topProducts.length} onClick={() => document.getElementById('top-semana')?.scrollIntoView({ behavior: 'smooth', block: 'start' })} className="mt-3 rounded-full bg-white px-3 py-1.5 text-[11px] font-extrabold text-[#4C1D95] disabled:cursor-not-allowed disabled:opacity-45">{topProducts.length ? 'Ver ranking →' : 'Aún sin ranking'}</button>
        </div>
        <div className="podium" aria-hidden="true"><span className="podium-two">2</span><span className="podium-one"><Crown className="h-5 w-5" />1</span><span className="podium-three">3</span></div>
      </section>

      {topProducts.length > 0 && (
        <section id="top-semana" className="mt-5 scroll-mt-4">
          <div className="mb-2.5 flex items-center justify-between"><h2 className="section-title">Top de la semana</h2><span className="text-[10px] text-muted">Se actualiza por pujas</span></div>
          <div className="grid grid-cols-3 gap-2">
            {topProducts.map((product) => (
              <button key={product.id} onClick={() => openProduct(product.id)} className={`top-mini top-mini-${product.jerarquia_top} text-left`}>
                <div className="relative aspect-square overflow-hidden rounded-[13px]"><img src={product.imagen_url} alt={product.titulo} className="h-full w-full object-cover" /><span className="top-rank">#{product.jerarquia_top}</span></div>
                <h3 className="mt-2 line-clamp-2 text-[11px] font-bold leading-tight">{product.titulo}</h3>
                <p className="mt-1 text-[10px] text-muted">{product.puja_ucoins || 0} UCoins</p>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="mt-5">
        <div className="mb-2.5 flex items-center justify-between"><h2 className="section-title">Explora productos</h2><button onClick={() => setSearchOpen((value) => !value)} className="icon-button" aria-label="Buscar"><Search className="h-5 w-5" /></button></div>
        <AnimatePresence>{searchOpen && <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mb-3 overflow-hidden"><div className="search-field"><Search /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar productos, apuntes, comida…" /><button onClick={() => { setQuery(''); setSearchOpen(false); }}><X /></button></div></motion.div>}</AnimatePresence>
        <div className="chips-row">{categorias.map((categoria) => <button key={categoria} onClick={() => setSelectedCategoria(categoria)} className={`filter-chip ${selectedCategoria === categoria ? 'filter-chip-active' : ''}`}>{categoria}</button>)}</div>
      </section>

      <section className="mt-3 space-y-3 pb-3">
        {regularProducts.length ? regularProducts.map((product, index) => <motion.div key={product.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index * 0.035, 0.18) }}><ProductCard product={product} /></motion.div>) : <div className="empty-card">No encontramos publicaciones con esos filtros.</div>}
      </section>
      <AnimatePresence>{notificationsOpen && <NotificationCenter onClose={() => setNotificationsOpen(false)} />}</AnimatePresence>
    </div>
  );
}
