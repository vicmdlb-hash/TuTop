import { useMemo, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, Camera, CheckCircle2, ChevronDown, Lightbulb, Loader2, Plus, Sparkles, WandSparkles, X } from 'lucide-react';
import { MARKETPLACE_CATEGORIES, VALID_MEETING_POINTS, isForbiddenProductText, reviewProductDraft } from '../lib/productAssistant';
import { feedbackError, feedbackSuccess, feedbackTap } from '../lib/feedback';
import { compressImageForFirestore } from '../lib/imageCompression';
import { askTopi } from '../services/assistantProvider';
import { useAppStore } from '../store/useAppStore';
import type { Product, ProductCategory, ProductFormData } from '../types';
import PreviewModal from './PreviewModal';

const fallbackImage = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600" viewBox="0 0 900 600">
<defs><linearGradient id="g" x1="0" x2="1"><stop stop-color="#0f172a"/><stop offset="1" stop-color="#4c1d95"/></linearGradient></defs>
<rect width="900" height="600" fill="url(#g)"/><circle cx="450" cy="265" r="88" fill="#8b5cf6" opacity=".22"/><path d="M390 190h120v36h-40v130h-40V226h-40z" fill="#fff"/><text x="450" y="420" text-anchor="middle" font-size="24" fill="#cbd5e1" font-family="Arial">TuTop · sin foto</text>
</svg>`)}`;

const emptyDraft = (faculty: string): Partial<ProductFormData> => ({ facultad: faculty, punto_encuentro: 'Coordinar por Chat' });

export default function Chatbot() {
  const { publishProduct, user, setActiveTab, syncError, products } = useAppStore();
  const [draft, setDraft] = useState<Partial<ProductFormData>>(() => emptyDraft(user.facultad));
  const [images, setImages] = useState<string[]>([]);
  const [imageBusy, setImageBusy] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [topiOpen, setTopiOpen] = useState(false);
  const [topiBusy, setTopiBusy] = useState<string | null>(null);
  const [topiMessage, setTopiMessage] = useState('Topi está aquí solo cuando tú lo necesites.');
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const issues = useMemo(() => reviewProductDraft({ ...draft, imagen_url: images[0], imagenes_url: images }), [draft, images]);
  const requiredReady = Boolean(draft.titulo?.trim() && draft.precio_mxn && draft.categoria && draft.punto_encuentro && draft.facultad);

  const update = <K extends keyof ProductFormData>(key: K, value: ProductFormData[K] | undefined) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setError(null);
  };

  const handleFiles = async (files?: FileList | null) => {
    if (!files?.length) return;
    try {
      setImageBusy(true);
      setError(null);
      const remaining = Math.max(0, 4 - images.length);
      const selected = Array.from(files).slice(0, remaining);
      const compressed: string[] = [];
      for (const file of selected) {
        compressed.push(await compressImageForFirestore(file, { maxDimension: 960, maxBytes: 82_000 }));
      }
      setImages((current) => [...current, ...compressed].slice(0, 4));
      feedbackTap();
    } catch (fileError) {
      setError(fileError instanceof Error ? fileError.message : 'No pudimos procesar esa imagen.');
      feedbackError();
    } finally {
      setImageBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const ask = async (action: 'category' | 'description' | 'price' | 'review') => {
    try {
      setTopiOpen(true);
      setTopiBusy(action);
      setError(null);
      const result = await askTopi(action, { draft: { ...draft, imagen_url: images[0], imagenes_url: images }, products });
      const localLabel = result.source === 'local' ? 'sin costo' : 'IA conectada';
      if (action === 'category') {
        if (result.category) {
          update('categoria', result.category);
          setTopiMessage(`Te sugiero “${result.category}”. La dejé seleccionada, pero puedes cambiarla cuando quieras. · ${localLabel}`);
        } else setTopiMessage('Todavía no tengo suficiente contexto para elegir categoría. Escribe un título más específico o elígela manualmente.');
      }
      if (action === 'description') {
        if (result.description) {
          update('descripcion', result.description);
          setTopiMessage(`Mejoré la descripción. Revísala y cámbiala libremente antes de publicar. · ${localLabel}`);
        }
      }
      if (action === 'price') {
        if (result.priceSuggestion) {
          const { low, high, median, samples } = result.priceSuggestion;
          setTopiMessage(`En TuTop encontré ${samples} publicaciones comparables. Rango orientativo: $${low.toLocaleString('es-MX')}–$${high.toLocaleString('es-MX')}; punto medio $${median.toLocaleString('es-MX')}. Tú decides el precio final.`);
        } else setTopiMessage('Aún no hay suficientes publicaciones comparables para sugerir un precio responsable. Pon el precio que consideres justo.');
      }
      if (action === 'review') {
        const reviewIssues = result.issues || [];
        setTopiMessage(reviewIssues.length ? `Antes de publicar revisa: ${reviewIssues.join(' · ')}` : 'Todo se ve bien. El anuncio tiene los datos principales y está listo para vista previa.');
      }
    } catch {
      setTopiMessage('Topi no pudo ayudarte esta vez, pero puedes seguir publicando manualmente sin ningún problema.');
    } finally {
      setTopiBusy(null);
    }
  };

  const openPreview = () => {
    const fullText = `${draft.titulo || ''} ${draft.descripcion || ''}`;
    if (isForbiddenProductText(fullText)) {
      setError('Ese anuncio parece incluir algo que no está permitido en TuTop. Revisa el título o la descripción.');
      feedbackError();
      return;
    }
    if (!requiredReady) {
      setError('Completa título, precio, categoría y forma de entrega antes de continuar.');
      feedbackError();
      return;
    }
    setShowPreview(true);
  };

  const handlePublish = async (impulsar: boolean) => {
    if (!draft.titulo || !draft.precio_mxn || !draft.categoria || !draft.facultad || !draft.punto_encuentro || publishing) return;
    setPublishing(true);
    setError(null);
    const product: Product = {
      id: `prod-${crypto.randomUUID ? crypto.randomUUID() : Date.now()}`,
      vendedor_id: user.id,
      vendedor_nombre: user.nombre,
      vendedor_handle: `@${user.nombre.toLowerCase().replace(/[^a-z0-9áéíóúñ]+/gi, '.').replace(/^\.|\.$/g, '') || 'estudiante'}`,
      vendedor_verificado: user.esta_verificado,
      titulo: draft.titulo.trim().slice(0, 120),
      descripcion: draft.descripcion?.trim().slice(0, 1000) || '',
      precio_mxn: Number(draft.precio_mxn),
      stock: Math.max(1, Number(draft.stock || 1)),
      categoria: draft.categoria,
      facultad: draft.facultad,
      punto_encuentro: draft.punto_encuentro,
      imagen_url: images[0] || fallbackImage,
      imagenes_url: images.length ? images : undefined,
      estado: 'Activo',
      es_top: false,
      jerarquia_top: 0,
      puja_ucoins: 0,
      likes: 0,
      fecha_creacion: new Date().toISOString(),
    };

    const ok = await publishProduct(product, impulsar ? 5 : 0);
    setPublishing(false);
    if (!ok) {
      setError(syncError ? 'No pudimos publicar. Revisa tu conexión e inténtalo otra vez.' : 'No pudimos publicar en este momento.');
      feedbackError();
      return;
    }
    feedbackSuccess();
    setShowPreview(false);
    setDraft(emptyDraft(user.facultad));
    setImages([]);
    setTopiMessage(impulsar ? 'Publicado e impulsado. ¡Ya compite por el Top de la semana! ✨' : 'Publicado. Tu anuncio ya está visible en TuTop. ✨');
    setTopiOpen(true);
    window.setTimeout(() => setActiveTab('feed'), 700);
  };

  return (
    <div className="publish-screen pb-[calc(82px+env(safe-area-inset-bottom))]">
      <header className="publish-header pt-safe">
        <button onClick={() => setActiveTab('feed')} className="icon-button-lg" aria-label="Volver"><ArrowLeft className="h-5 w-5" /></button>
        <div className="min-w-0 flex-1"><h1 className="text-[18px] font-black">Publicar en TuTop</h1><p className="mt-0.5 text-[10px] text-slate-500">Tú mandas. Topi solo ayuda si lo llamas.</p></div>
        <button onClick={() => setTopiOpen((value) => !value)} className={`topi-button ${topiOpen ? 'topi-button-active' : ''}`}><Sparkles className="h-4 w-4" />Topi</button>
      </header>

      <main className="page-pad pt-3">
        <section className="publish-card">
          <div className="flex items-center justify-between gap-3"><div><p className="eyebrow">1 · FOTOS</p><h2 className="mt-1 text-sm font-black">Muéstralo bien</h2></div><span className="text-[10px] font-bold text-slate-600">{images.length}/4</span></div>
          <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(event) => void handleFiles(event.target.files)} />
          <div className="mt-3 grid grid-cols-4 gap-2">
            {images.map((image, index) => <div key={`${image.slice(0, 30)}-${index}`} className="publish-photo relative"><img src={image} alt={`Foto ${index + 1}`} /><button onClick={() => setImages((current) => current.filter((_, photoIndex) => photoIndex !== index))} aria-label="Quitar foto"><X /></button>{index === 0 && <span>PORTADA</span>}</div>)}
            {images.length < 4 && <button disabled={imageBusy} onClick={() => fileInputRef.current?.click()} className="publish-photo-add">{imageBusy ? <Loader2 className="animate-spin" /> : <Plus />}<small>Agregar</small></button>}
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-[9px] text-slate-600"><Camera className="h-3.5 w-3.5" />Hasta 4 fotos, optimizadas automáticamente para cargar rápido.</div>
        </section>

        <section className="publish-card mt-3">
          <p className="eyebrow">2 · DATOS DEL ANUNCIO</p>
          <label className="publish-label">Título</label>
          <input value={draft.titulo || ''} onChange={(event) => update('titulo', event.target.value)} className="publish-input" maxLength={120} placeholder="Ej. Calculadora Casio científica" />

          <div className="mt-3 grid grid-cols-[.7fr_.45fr_1.2fr] gap-2">
            <div><label className="publish-label mt-0">Precio</label><div className="relative"><span className="absolute left-3 top-3 text-sm font-black text-emerald-300">$</span><input value={draft.precio_mxn || ''} onChange={(event) => update('precio_mxn', event.target.value ? Math.max(0, Number(event.target.value)) : undefined)} className="publish-input pl-7" inputMode="decimal" type="number" min="1" max="1000000" placeholder="0" /></div></div>
            <div><label className="publish-label mt-0">Cant.</label><input value={draft.stock || 1} onChange={(event) => update('stock', Math.max(1, Math.min(99, Number(event.target.value) || 1)))} className="publish-input" inputMode="numeric" type="number" min="1" max="99" /></div>
            <div><label className="publish-label mt-0">Categoría</label><div className="relative"><select value={draft.categoria || ''} onChange={(event) => update('categoria', event.target.value as ProductCategory)} className="publish-input appearance-none pr-9"><option value="" disabled>Elige una</option>{MARKETPLACE_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}</select><ChevronDown className="pointer-events-none absolute right-3 top-3.5 h-4 w-4 text-slate-600" /></div></div>
          </div>

          <label className="publish-label">Descripción</label>
          <textarea value={draft.descripcion || ''} onChange={(event) => update('descripcion', event.target.value)} className="publish-textarea" maxLength={1000} rows={4} placeholder="Estado, talla, qué incluye, horarios, detalles importantes…" />
          <div className="mt-2 flex justify-between text-[9px] text-slate-600"><span>Claro y breve vende mejor.</span><span>{draft.descripcion?.length || 0}/1000</span></div>

          <label className="publish-label">Entrega</label>
          <div className="grid grid-cols-2 gap-2">
            {VALID_MEETING_POINTS.map((point) => <button key={point} onClick={() => update('punto_encuentro', point)} className={`meeting-option ${draft.punto_encuentro === point ? 'meeting-option-active' : ''}`}>{draft.punto_encuentro === point && <CheckCircle2 />}{point}</button>)}
          </div>
        </section>

        <section className="publish-card mt-3">
          <div className="flex items-center gap-2"><div className="grid h-9 w-9 place-items-center rounded-xl bg-violet-500/10 text-violet-300"><WandSparkles className="h-4 w-4" /></div><div className="flex-1"><p className="text-xs font-black">Ayuda opcional de Topi</p><p className="text-[9px] text-slate-600">Nunca controla la publicación por ti.</p></div></div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <AssistButton busy={topiBusy === 'category'} onClick={() => void ask('category')} icon={<Sparkles />} label="Sugerir categoría" />
            <AssistButton busy={topiBusy === 'description'} onClick={() => void ask('description')} icon={<WandSparkles />} label="Mejorar descripción" />
            <AssistButton busy={topiBusy === 'price'} onClick={() => void ask('price')} icon={<Lightbulb />} label="Orientar precio" />
            <AssistButton busy={topiBusy === 'review'} onClick={() => void ask('review')} icon={<CheckCircle2 />} label="Revisar anuncio" />
          </div>
          <AnimatePresence>{topiOpen && <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden"><div className="topi-message"><span className="brand-mini">T</span><p>{topiMessage}</p></div></motion.div>}</AnimatePresence>
        </section>

        {error && <div className="mt-3 rounded-2xl border border-rose-400/10 bg-rose-500/10 px-3 py-3 text-xs leading-5 text-rose-200">{error}</div>}
        {!error && issues.length > 0 && requiredReady && <p className="mt-3 text-center text-[9px] leading-4 text-slate-600">Topi detecta {issues.length} sugerencia{issues.length === 1 ? '' : 's'} opcional{issues.length === 1 ? '' : 'es'} antes de publicar.</p>}

        <button onClick={openPreview} disabled={!requiredReady || publishing} className="publish-primary mt-4">Ver vista previa <ArrowLeft className="rotate-180" /></button>
      </main>

      <AnimatePresence>{showPreview && requiredReady && <PreviewModal formData={{ ...(draft as ProductFormData), imagen_url: images[0] || fallbackImage, imagenes_url: images }} onClose={() => !publishing && setShowPreview(false)} onPublish={(boost) => void handlePublish(boost)} />}</AnimatePresence>
    </div>
  );
}

function AssistButton({ busy, onClick, icon, label }: { busy: boolean; onClick: () => void; icon: ReactNode; label: string }) {
  return <button disabled={busy} onClick={onClick} className="assist-button">{busy ? <Loader2 className="animate-spin" /> : icon}<span>{label}</span></button>;
}
