import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, BadgeCheck, Flag, Heart, MapPin, MessageCircle, Share2, ShieldCheck, Sparkles, Tag, TimerReset, Video } from 'lucide-react';
import { feedbackFavorite, feedbackTap } from '../lib/feedback';
import { parseListingDescription } from '../lib/listingDetails';
import { normalizeCategory } from '../lib/productAssistant';
import { sellerReputationEvidence } from '../lib/reputationEvidence';
import { firebaseMediaStorage, mediaStorageEnabled } from '../services/firebaseMediaStorage';
import { onlineBackend } from '../services/onlineBackend';
import { useAppStore } from '../store/useAppStore';
import type { Product } from '../types';
import SellerPublicProfile from './SellerPublicProfile';
import SellerReputationInline from './SellerReputationInline';

const RECENT_KEY = 'tutop.recent-products.v1';

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.max(1, Math.floor(diff / 60_000));
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return `hace ${days} d`;
}

export default function ProductDetail() {
  const { selectedProductId, products, favorites, closeProduct, toggleFavorite, contactProduct, openProduct, sendMessage, user, reviews, chats } = useAppStore();
  const [photoIndex, setPhotoIndex] = useState(0);
  const [topiOpen, setTopiOpen] = useState(false);
  const [sellerProfileOpen, setSellerProfileOpen] = useState(false);
  const [videoObjectUrl, setVideoObjectUrl] = useState<string | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);
  useEffect(() => { setPhotoIndex(0); setSellerProfileOpen(false); }, [selectedProductId]);
  if (!selectedProductId) return null;
  const product = products.find((item) => item.id === selectedProductId);
  if (!product) return null;
  const favorite = favorites.includes(product.id);
  const ownProduct = product.vendedor_id === user.id;
  const photos = product.imagenes_url?.length ? product.imagenes_url : [product.imagen_url];
  const activePhoto = photos[Math.min(photoIndex, photos.length - 1)] || product.imagen_url;
  const videoUri = (product as Product & { video_urls?: string[] }).video_urls?.[0];
  const parsed = parseListingDescription(product.descripcion);
  const detailEntries = Object.entries(parsed.details).slice(0, 12);
  const negotiable = parsed.details['Precio negociable']?.toLowerCase() === 'sí';
  const deliverySummary = parsed.details['Entrega'] || product.punto_encuentro;
  const similar = useMemo(() => products.filter((item) => item.id !== product.id && item.estado === 'Activo' && normalizeCategory(item.categoria) === normalizeCategory(product.categoria)).slice(0, 4), [products, product]);
  const reputation = sellerReputationEvidence(product.vendedor_id, reviews, chats);

  useEffect(() => {
    try {
      const previous = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]') as string[];
      localStorage.setItem(RECENT_KEY, JSON.stringify([product.id, ...previous.filter((id) => id !== product.id)].slice(0, 12)));
    } catch { /* local history is optional */ }
  }, [product.id]);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    setVideoObjectUrl(null);
    setVideoError(null);
    if (!videoUri) return () => undefined;
    if (!mediaStorageEnabled()) {
      setVideoError('Video disponible en el anuncio, pero Cloud Storage está desactivado en este build.');
      return () => undefined;
    }
    void firebaseMediaStorage.loadVideoBlobUrl(videoUri)
      .then((url) => {
        if (cancelled) { URL.revokeObjectURL(url); return; }
        objectUrl = url;
        setVideoObjectUrl(url);
      })
      .catch((error) => {
        if (!cancelled) setVideoError(error instanceof Error ? error.message : 'No pudimos cargar el video.');
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [videoUri]);

  const share = async () => {
    feedbackTap();
    const text = `${product.titulo} · $${product.precio_mxn.toLocaleString('es-MX')} MXN en TuTop`;
    if (navigator.share) await navigator.share({ title: product.titulo, text }).catch(() => undefined);
    else await navigator.clipboard?.writeText(text).catch(() => undefined);
  };

  const report = async () => {
    if (ownProduct) return;
    const reason = window.prompt('¿Por qué quieres reportar esta publicación?');
    if (!reason || reason.trim().length < 3) return;
    try {
      await onlineBackend.submitReport('product', product.id, reason);
      window.alert('Gracias. El equipo de TuTop revisará este reporte.');
    } catch {
      window.alert('No pudimos enviar el reporte. Inténtalo de nuevo.');
    }
  };

  const startOffer = () => {
    if (ownProduct) return;
    feedbackTap();
    contactProduct(product.id);
  };

  return (
    <motion.div className="detail-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.article className="detail-sheet" initial={{ y: 60 }} animate={{ y: 0 }} exit={{ y: 60 }} transition={{ type: 'spring', damping: 28, stiffness: 330 }}>
        <div className="relative aspect-[4/3] overflow-hidden bg-[#101827]">
          <motion.img key={`${product.id}-${photoIndex}`} initial={{ opacity: 0.65, scale: 1.01 }} animate={{ opacity: 1, scale: 1 }} src={activePhoto} alt={product.titulo} className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/45 via-transparent to-black/55" />
          <button onClick={closeProduct} className="detail-floating left-3" aria-label="Regresar"><ArrowLeft /></button>
          <button onClick={share} className="detail-floating right-3" aria-label="Compartir"><Share2 /></button>
          <div className="absolute bottom-3 left-3 flex flex-wrap gap-1.5"><span className="rounded-full bg-black/55 px-3 py-1 text-[10px] font-semibold backdrop-blur">{product.categoria}</span><span className="rounded-full bg-emerald-500/85 px-3 py-1 text-[10px] font-black text-white">{product.estado === 'Activo' ? 'Disponible' : product.estado}</span>{videoUri && <span className="inline-flex items-center gap-1 rounded-full bg-violet-600/85 px-2.5 py-1 text-[9px] font-black text-white"><Video className="h-3 w-3" />Video</span>}</div>
          {photos.length > 1 && <span className="absolute bottom-3 right-3 rounded-full bg-black/55 px-2.5 py-1 text-[9px] font-bold backdrop-blur">{photoIndex + 1}/{photos.length}</span>}
        </div>
        {photos.length > 1 && <div className="flex gap-2 overflow-x-auto border-b border-white/[0.05] bg-[#09111d] px-4 py-2.5">{photos.map((photo, index) => <button key={`${photo.slice(0, 24)}-${index}`} onClick={() => { setPhotoIndex(index); feedbackTap(); }} className={`detail-thumb ${photoIndex === index ? 'detail-thumb-active' : ''}`}><img src={photo} alt={`Foto ${index + 1}`} /></button>)}</div>}
        <div className="p-4 pb-[calc(22px+env(safe-area-inset-bottom))]">
          <div className="flex items-start justify-between gap-4"><div className="min-w-0"><h1 className="text-[21px] font-black leading-tight">{product.titulo}</h1><div className="mt-1 flex flex-wrap items-center gap-2 text-[9px] text-slate-500"><span>{relativeTime(product.updated_at || product.fecha_creacion)}</span>{negotiable && <span className="rounded-full bg-violet-500/10 px-2 py-1 font-bold text-violet-200">Precio negociable</span>}</div></div><strong className="shrink-0 text-[22px] text-success">${product.precio_mxn.toLocaleString('es-MX')}</strong></div>
          <p className="mt-3 text-[12px] leading-relaxed text-[#9ba6b8]">{parsed.body || 'Publicación de la comunidad TuTop.'}</p>

          {videoObjectUrl && <section className="mt-4 overflow-hidden rounded-2xl border border-violet-400/10 bg-black/30"><video className="aspect-video w-full bg-black object-contain" src={videoObjectUrl} controls playsInline preload="metadata" /><div className="flex items-center gap-2 px-3 py-2 text-[9px] text-violet-200"><Video className="h-3.5 w-3.5" />Video del producto · cargado con sesión autenticada</div></section>}
          {videoUri && !videoObjectUrl && videoError && <section className="mt-4 rounded-2xl border border-amber-400/10 bg-amber-500/[0.04] p-3 text-[9px] leading-4 text-amber-100/75"><div className="flex items-center gap-2 font-black"><Video className="h-3.5 w-3.5" />Video no disponible</div><p className="mt-1">{videoError}</p></section>}

          {detailEntries.length > 0 && <section className="mt-4 rounded-2xl border border-white/5 bg-[#0d1725] p-3"><div className="mb-2 flex items-center gap-2"><Tag className="h-4 w-4 text-violet-300" /><h2 className="text-[11px] font-black">Detalles</h2></div><div className="grid grid-cols-2 gap-2">{detailEntries.map(([label, value]) => <div key={label} className="rounded-xl bg-white/[0.025] p-2.5"><p className="text-[8px] font-bold uppercase tracking-wide text-slate-600">{label}</p><p className="mt-1 text-[10px] font-semibold text-slate-300">{value}</p></div>)}</div></section>}

          <div className="mt-4 rounded-2xl border border-white/5 bg-[#0d1725] p-3">
            <button type="button" onClick={() => setSellerProfileOpen(true)} className="flex w-full items-center gap-2 text-left" aria-label={`Ver perfil público de ${product.vendedor_nombre}`}>
              <div className="avatar-chip">{product.vendedor_nombre.slice(0, 1).toUpperCase()}</div><div className="min-w-0 flex-1"><div className="flex items-center gap-1 text-[13px] font-bold"><span className="truncate">{product.vendedor_nombre}</span>{product.vendedor_verificado && <BadgeCheck className="h-4 w-4 text-sky-400" fill="currentColor" />}</div><p className="mt-0.5 text-[10px] text-muted">Facultad de {product.facultad} · Ver perfil</p></div>{product.vendedor_verificado && <ShieldCheck className="h-5 w-5 text-success" />}
            </button>
            <SellerReputationInline sellerId={product.vendedor_id} visibleEvidence={reputation} />
          </div>
          <div className="mt-3 flex items-center justify-between gap-2 rounded-2xl border border-white/5 bg-[#0d1725] p-3 text-[12px] text-[#b6c0cf]"><span className="inline-flex items-center gap-2"><MapPin className="h-4 w-4 text-success" />{deliverySummary}</span><span className="text-[10px] font-bold text-slate-500">{product.stock || 1} disponible{(product.stock || 1) === 1 ? '' : 's'}</span></div>

          {!ownProduct && <section className="mt-3 rounded-2xl border border-violet-400/10 bg-violet-500/[0.055] p-3"><button onClick={() => setTopiOpen((value) => !value)} className="flex w-full items-center gap-2 text-left"><span className="brand-mini">T</span><span className="flex-1"><strong className="block text-[11px]">Topi puede ayudarte</strong><small className="text-[9px] text-slate-500">Preguntas útiles antes de comprar.</small></span><Sparkles className="h-4 w-4 text-violet-300" /></button>{topiOpen && <div className="mt-3 flex flex-wrap gap-2">{['¿Sigue disponible?', '¿Qué incluye exactamente?', '¿Dónde entregas?', negotiable ? '¿Aceptarías una oferta?' : '¿El precio es fijo?'].map((text) => <button key={text} onClick={() => { const chatId = contactProduct(product.id); if (chatId) sendMessage(chatId, text); }} className="rounded-full border border-white/5 bg-white/[0.035] px-3 py-2 text-[9px] font-bold text-slate-300">{text}</button>)}</div>}</section>}

          <div className="mt-4 flex gap-2"><button onClick={() => { toggleFavorite(product.id); feedbackFavorite(); }} className={`detail-favorite ${favorite ? 'favorite-button-active' : ''}`}><Heart className="h-5 w-5" fill={favorite ? 'currentColor' : 'none'} />{favorite ? 'Guardado' : 'Guardar'}</button><button onClick={() => { if (!ownProduct) { feedbackTap(); contactProduct(product.id); } }} disabled={ownProduct} className="detail-contact"><MessageCircle className="h-5 w-5" />{ownProduct ? 'Es tu publicación' : 'Contactar'}</button></div>
          {!ownProduct && <button onClick={startOffer} className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl border border-emerald-400/15 bg-emerald-500/10 py-3 text-xs font-black text-emerald-200"><TimerReset className="h-4 w-4" />Negociar / hacer oferta</button>}

          {similar.length > 0 && <section className="mt-5"><div className="mb-2 flex items-center justify-between"><h2 className="text-xs font-black">También podría interesarte</h2><span className="text-[9px] text-slate-600">Productos similares</span></div><div className="grid grid-cols-2 gap-2">{similar.map((item) => <button key={item.id} onClick={() => openProduct(item.id)} className="overflow-hidden rounded-2xl border border-white/5 bg-white/[0.025] text-left"><img src={item.imagen_url} alt={item.titulo} className="aspect-[4/3] w-full object-cover" /><div className="p-2"><p className="line-clamp-1 text-[10px] font-bold">{item.titulo}</p><p className="mt-1 text-[11px] font-black text-emerald-300">${item.precio_mxn.toLocaleString('es-MX')}</p></div></button>)}</div></section>}

          {!ownProduct && <button onClick={() => void report()} className="mx-auto mt-4 flex items-center gap-1.5 text-[10px] font-semibold text-slate-500 transition hover:text-rose-300"><Flag className="h-3.5 w-3.5" />Reportar publicación</button>}
          <p className="mt-3 text-center text-[9px] text-muted">TuTop no procesa el pago. Acuerda entrega y pago directamente con la otra persona y procura reunirte en un lugar público.</p>
        </div>
      </motion.article>
      {sellerProfileOpen && <SellerPublicProfile sellerId={product.vendedor_id} sellerName={product.vendedor_nombre} faculty={product.facultad} verified={product.vendedor_verificado} onClose={() => setSellerProfileOpen(false)} />}
    </motion.div>
  );
}