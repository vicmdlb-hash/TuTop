import { motion } from 'framer-motion';
import { MapPin, Rocket, X } from 'lucide-react';
import type { ProductFormData } from '../types';

export default function PreviewModal({ formData, onClose, onPublish }: { formData: ProductFormData; onClose: () => void; onPublish: (impulsar: boolean) => void }) {
  const photos = formData.imagenes_url?.length ? formData.imagenes_url : formData.imagen_url ? [formData.imagen_url] : [];
  return (
    <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div className="preview-sheet" initial={{ y: 70, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 70, opacity: 0 }} transition={{ type: 'spring', damping: 24, stiffness: 260 }}>
        <div className="sheet-handle" />
        <div className="flex items-center justify-between"><div><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">Vista previa</p><h2 className="mt-1 text-xl font-extrabold">Así lo verán en TuTop</h2></div><button onClick={onClose} className="icon-button-lg"><X className="h-5 w-5" /></button></div>
        <div className="mt-5 overflow-hidden rounded-[20px] border border-white/10 bg-[#111A2A]">
          <div className="relative h-44 overflow-hidden bg-[radial-gradient(circle_at_70%_20%,#7C3AED_0%,#312E81_35%,#111827_75%)]">{photos[0] && <img src={photos[0]} alt={formData.titulo} className="h-full w-full object-cover" />}<div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" /><div className="absolute bottom-4 left-4"><span className="rounded-full bg-black/45 px-2.5 py-1 text-[10px]">{formData.categoria}</span><p className="mt-2 text-3xl font-black">${formData.precio_mxn.toLocaleString('es-MX')}</p></div>{photos.length > 1 && <span className="absolute right-3 top-3 rounded-full bg-black/50 px-2 py-1 text-[9px] font-bold">{photos.length} fotos</span>}</div>
          <div className="p-4"><h3 className="text-[16px] font-bold">{formData.titulo}</h3>{formData.descripcion && <p className="mt-2 line-clamp-3 text-[11px] leading-5 text-slate-400">{formData.descripcion}</p>}<p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted"><MapPin className="h-3.5 w-3.5 text-success" />{formData.punto_encuentro}</p></div>
        </div>
        <p className="mt-3 text-center text-[9px] leading-relaxed text-slate-600">Tú conservas el control del anuncio. Puedes volver y cambiar cualquier dato antes de publicarlo.</p>
        <button onClick={() => onPublish(false)} className="option-card mt-3"><div><strong>Publicar</strong><p>Aparece en el feed de tu facultad</p></div><span>Gratis</span></button>
        <button onClick={() => onPublish(true)} className="option-card option-card-featured mt-2"><div className="flex items-start gap-3"><span className="rocket-disc"><Rocket className="h-4 w-4" /></span><div><strong>Publicar + impulsar</strong><p>Participa en el Top semanal</p></div></div><span className="text-[#FBBF24]">5 UCoins</span></button>
      </motion.div>
    </motion.div>
  );
}
