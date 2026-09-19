import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { BadgeCheck, CircleDollarSign, Heart, MapPin, MessageCircle, MoreHorizontal, PackageCheck, ShieldCheck } from 'lucide-react';
import type { Product } from '../types';
import { useAppStore } from '../store/useAppStore';
import { feedbackFavorite, feedbackTap } from '../lib/feedback';
import { NEARBY_LOCATION_EVENT, getCachedApproxLocation, productDistanceKm, type ApproxLocation } from '../lib/nearbyMarketplace';
import { parseListingDescription } from '../lib/listingDetails';
import { sellerReputationEvidence } from '../lib/reputationEvidence';

function relativeTime(iso: string) {
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return 'Ahora';
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return 'Ahora';
  if (minutes < 60) return `Hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Hace ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `Hace ${days} d`;
  return new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
}

function distanceLabel(distance: number | null) {
  if (distance === null || !Number.isFinite(distance)) return null;
  if (distance < 0.15) return '~0.1 km';
  return `~${distance < 10 ? distance.toFixed(1) : Math.round(distance)} km`;
}

export default function ProductCard({ product }: { product: Product }) {
  const { favorites, toggleFavorite, contactProduct, openProduct, user, reviews, chats } = useAppStore();
  const favorite = favorites.includes(product.id);
  const ownProduct = product.vendedor_id === user.id;
  const parsed = parseListingDescription(product.descripcion);
  const negotiable = product.precio_negociable === true || parsed.details['Precio negociable']?.toLowerCase() === 'sí';
  const delivery = parsed.details['Entrega'] || parsed.details['Horario'] || parsed.details['Disponibilidad'];
  const reputation = sellerReputationEvidence(product.vendedor_id, reviews, chats);
  const [viewerLocation, setViewerLocation] = useState<ApproxLocation | null>(() => getCachedApproxLocation(user.id));

  useEffect(() => {
    const onLocation = (event: Event) => {
      const detail = (event as CustomEvent<ApproxLocation>).detail;
      if (detail) setViewerLocation(detail);
    };
    window.addEventListener(NEARBY_LOCATION_EVENT, onLocation);
    return () => window.removeEventListener(NEARBY_LOCATION_EVENT, onLocation);
  }, []);

  const distance = productDistanceKm(viewerLocation, product);
  const proximity = distanceLabel(distance);

  return (
    <motion.article whileTap={{ scale: 0.995 }} className="market-card">
      <div className="flex items-center gap-3 px-3.5 pt-3.5 pb-3">
        <div className="avatar-chip">{product.vendedor_nombre.slice(0, 1).toUpperCase()}</div>
        <button onClick={() => openProduct(product.id)} className="min-w-0 flex-1 text-left">
          <div className="flex items-center gap-1 text-[13px] font-semibold">
            <span className="truncate">{product.vendedor_handle || product.vendedor_nombre}</span>
            {product.vendedor_verificado && <BadgeCheck className="h-4 w-4 text-[#38BDF8]" fill="currentColor" strokeWidth={1.5} />}
          </div>
          <p className="mt-0.5 text-[11px] text-muted">{relativeTime(product.fecha_creacion)} · {product.facultad}</p>
          <p className={`mt-1 flex items-center gap-1 text-[8px] ${reputation.hasEvidence ? 'text-emerald-300/80' : 'text-slate-600'}`}><ShieldCheck className="h-3 w-3" />{reputation.label}</p>
        </button>
        <button onClick={() => openProduct(product.id)} className="icon-button" aria-label="Ver detalles"><MoreHorizontal className="h-5 w-5" /></button>
      </div>

      <button onClick={() => openProduct(product.id)} className="relative block aspect-[1.5/1] w-full overflow-hidden bg-[#101827] text-left">
        <img src={product.imagen_url} alt={product.titulo} className="h-full w-full object-cover" loading="lazy" />
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/70 to-transparent" />
        <div className="absolute bottom-3 left-3 flex flex-wrap gap-1.5"><span className="rounded-full bg-black/55 px-2.5 py-1 text-[10px] font-medium backdrop-blur">{product.categoria}</span>{negotiable && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/80 px-2 py-1 text-[9px] font-black text-white backdrop-blur"><CircleDollarSign className="h-3 w-3" />Negociable</span>}</div>
        <div className="absolute right-3 top-3 flex flex-col items-end gap-1.5">{proximity && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/90 px-2.5 py-1 text-[9px] font-black text-white shadow-lg backdrop-blur"><MapPin className="h-3 w-3" />{proximity}</span>}{(product.imagenes_url?.length || 0) > 1 && <span className="rounded-full bg-black/55 px-2 py-1 text-[9px] font-bold backdrop-blur">{product.imagenes_url?.length} fotos</span>}</div>
      </button>

      <div className="p-3.5">
        <button onClick={() => openProduct(product.id)} className="flex w-full items-start justify-between gap-4 text-left">
          <div className="min-w-0">
            <h3 className="truncate text-[16px] font-bold tracking-tight">{product.titulo}</h3>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted"><span className="inline-flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-success" />{proximity ? `${proximity} · ` : ''}{product.punto_encuentro}</span>{(product.stock || 1) > 1 && <span>· {product.stock} disponibles</span>}</div>
            {delivery && <p className="mt-1.5 flex items-center gap-1.5 truncate text-[9px] text-slate-500"><PackageCheck className="h-3 w-3 shrink-0 text-violet-300" /><span className="truncate">Entrega definida · {delivery}</span></p>}
          </div>
          <p className="shrink-0 text-[22px] font-extrabold text-success">${product.precio_mxn.toLocaleString('es-MX')}</p>
        </button>

        <div className="mt-3 flex items-center gap-2">
          <button onClick={() => { feedbackTap(); ownProduct ? openProduct(product.id) : contactProduct(product.id); }} className="contact-button"><MessageCircle className="h-4 w-4" />{ownProduct ? 'Ver publicación' : 'Contactar'}</button>
          <button onClick={() => { toggleFavorite(product.id); feedbackFavorite(); }} className={`favorite-button ${favorite ? 'favorite-button-active' : ''}`} aria-label="Guardar producto">
            <Heart className="h-5 w-5" fill={favorite ? 'currentColor' : 'none'} />
            <span>{favorite ? 'Guardado' : 'Guardar'}</span>
          </button>
        </div>
      </div>
    </motion.article>
  );
}
