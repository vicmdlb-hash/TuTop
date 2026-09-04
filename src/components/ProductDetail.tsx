import { motion } from 'framer-motion';
import { ArrowLeft, BadgeCheck, Flag, Heart, MapPin, MessageCircle, Share2, ShieldCheck } from 'lucide-react';
import { onlineBackend } from '../services/onlineBackend';
import { useAppStore } from '../store/useAppStore';

export default function ProductDetail() {
  const { selectedProductId, products, favorites, closeProduct, toggleFavorite, contactProduct, user } = useAppStore();
  if (!selectedProductId) return null;
  const product = products.find((item) => item.id === selectedProductId);
  if (!product) return null;
  const favorite = favorites.includes(product.id);
  const ownProduct = product.vendedor_id === user.id;

  const share = async () => {
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
      window.alert('Reporte enviado a MiTuTop Admin.');
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'No se pudo enviar el reporte.');
    }
  };

  return (
    <motion.div className="detail-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.article className="detail-sheet" initial={{ y: 60 }} animate={{ y: 0 }} exit={{ y: 60 }} transition={{ type: 'spring', damping: 28, stiffness: 330 }}>
        <div className="relative aspect-[4/3] overflow-hidden bg-[#101827]">
          <img src={product.imagen_url} alt={product.titulo} className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/45 via-transparent to-black/55" />
          <button onClick={closeProduct} className="detail-floating left-3" aria-label="Regresar"><ArrowLeft /></button>
          <button onClick={share} className="detail-floating right-3" aria-label="Compartir"><Share2 /></button>
          <span className="absolute bottom-3 left-3 rounded-full bg-black/55 px-3 py-1 text-[10px] font-semibold backdrop-blur">{product.categoria}</span>
        </div>
        <div className="p-4 pb-[calc(22px+env(safe-area-inset-bottom))]">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0"><h1 className="text-[21px] font-black leading-tight">{product.titulo}</h1><p className="mt-2 text-[12px] leading-relaxed text-[#9ba6b8]">{product.descripcion || 'Publicación de la comunidad TuTop.'}</p></div>
            <strong className="shrink-0 text-[22px] text-success">${product.precio_mxn.toLocaleString('es-MX')}</strong>
          </div>
          <div className="mt-4 flex items-center gap-2 rounded-2xl border border-white/5 bg-[#0d1725] p-3">
            <div className="avatar-chip">{product.vendedor_nombre.slice(0, 1).toUpperCase()}</div>
            <div className="min-w-0 flex-1"><div className="flex items-center gap-1 text-[13px] font-bold"><span className="truncate">{product.vendedor_nombre}</span>{product.vendedor_verificado && <BadgeCheck className="h-4 w-4 text-sky-400" fill="currentColor" />}</div><p className="mt-0.5 text-[10px] text-muted">Facultad de {product.facultad}</p></div>
            {product.vendedor_verificado && <ShieldCheck className="h-5 w-5 text-success" />}
          </div>
          <div className="mt-3 flex items-center gap-2 rounded-2xl border border-white/5 bg-[#0d1725] p-3 text-[12px] text-[#b6c0cf]"><MapPin className="h-4 w-4 text-success" /><span>Entrega: {product.punto_encuentro}</span></div>
          <div className="mt-4 flex gap-2">
            <button onClick={() => toggleFavorite(product.id)} className={`detail-favorite ${favorite ? 'favorite-button-active' : ''}`}><Heart className="h-5 w-5" fill={favorite ? 'currentColor' : 'none'} />{favorite ? 'Guardado' : 'Guardar'}</button>
            <button onClick={() => !ownProduct && contactProduct(product.id)} disabled={ownProduct} className="detail-contact"><MessageCircle className="h-5 w-5" />{ownProduct ? 'Es tu publicación' : 'Contactar'}</button>
          </div>
          {!ownProduct && <button onClick={() => void report()} className="mx-auto mt-3 flex items-center gap-1.5 text-[10px] font-semibold text-slate-500 transition hover:text-rose-300"><Flag className="h-3.5 w-3.5" />Reportar publicación</button>}
          <p className="mt-3 text-center text-[9px] text-muted">TuTop no procesa el pago del producto. Acuerda la entrega y el pago directamente con el otro estudiante.</p>
        </div>
      </motion.article>
    </motion.div>
  );
}
