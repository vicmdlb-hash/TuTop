import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, ArrowLeftRight, Camera, CheckCircle2, ChevronDown, Lightbulb, Loader2, Plus, Save, Sparkles, WandSparkles, X } from 'lucide-react';
import { MARKETPLACE_CATEGORIES, VALID_MEETING_POINTS, isForbiddenProductText, publicationQuality, reviewProductDraft } from '../lib/productAssistant';
import { adaptiveFieldsFor, formatListingDescription } from '../lib/listingDetails';
import { defaultScopeForCategory, VISIBILITY_SCOPES } from '../lib/universityNetwork';
import { feedbackError, feedbackSuccess, feedbackTap } from '../lib/feedback';
import { compressImageForFirestore } from '../lib/imageCompression';
import { askTopi } from '../services/assistantProvider';
import { nationalBackend, nationalSchemaEnabled } from '../services/nationalBackend';
import { useAppStore } from '../store/useAppStore';
import type { DeliveryMethod, ListingVisibilityScope, Product, ProductCategory, ProductCondition, ProductFormData } from '../types';
import PreviewModal from './PreviewModal';

const DRAFT_KEY = 'tutop.publish.draft.v3';
const fallbackImage = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600" viewBox="0 0 900 600">
<defs><linearGradient id="g" x1="0" x2="1"><stop stop-color="#0f172a"/><stop offset="1" stop-color="#4c1d95"/></linearGradient></defs>
<rect width="900" height="600" fill="url(#g)"/><circle cx="450" cy="265" r="88" fill="#8b5cf6" opacity=".22"/><path d="M390 190h120v36h-40v130h-40V226h-40z" fill="#fff"/><text x="450" y="420" text-anchor="middle" font-size="24" fill="#cbd5e1" font-family="Arial">TuTop · sin foto</text>
</svg>`)}`;

const conditions: ProductCondition[] = ['Nuevo', 'Como nuevo', 'Buen estado', 'Uso visible', 'Para reparar', 'No aplica'];
const deliveryMethods: DeliveryMethod[] = ['Nos encontramos', 'Recoge conmigo', 'Yo entrego', 'Acordamos por chat', 'Envío local', 'Punto TuTop'];
const emptyDraft = (faculty: string): Partial<ProductFormData> => ({ facultad: faculty, punto_encuentro: 'Coordinar por Chat', stock: 1, precio_negociable: false });
type PublishMode = 'quick' | 'detailed';

type StoredDraft = {
  mode?: PublishMode;
  draft?: Partial<ProductFormData>;
  images?: string[];
  adaptive?: Record<string, string>;
};

function safeStoredDraft(faculty: string) {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return { mode: 'quick' as PublishMode, draft: emptyDraft(faculty), images: [] as string[], adaptive: {} as Record<string, string> };
    const parsed = JSON.parse(raw) as StoredDraft;
    return {
      mode: parsed.mode === 'detailed' ? 'detailed' as PublishMode : 'quick' as PublishMode,
      draft: { ...emptyDraft(faculty), ...(parsed.draft || {}), facultad: faculty },
      images: Array.isArray(parsed.images) ? parsed.images.filter((value) => typeof value === 'string' && value.startsWith('data:image/')).slice(0, 4) : [],
      adaptive: parsed.adaptive && typeof parsed.adaptive === 'object' ? parsed.adaptive : {},
    };
  } catch {
    return { mode: 'quick' as PublishMode, draft: emptyDraft(faculty), images: [] as string[], adaptive: {} as Record<string, string> };
  }
}

export default function Chatbot() {
  const { publishProduct, user, setActiveTab, syncError, products } = useAppStore();
  const initial = useMemo(() => safeStoredDraft(user.facultad), [user.facultad]);
  const [mode, setMode] = useState<PublishMode>(initial.mode);
  const [draft, setDraft] = useState<Partial<ProductFormData>>(initial.draft);
  const [adaptive, setAdaptive] = useState<Record<string, string>>(initial.adaptive);
  const [images, setImages] = useState<string[]>(initial.images);
  const [imageBusy, setImageBusy] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [topiOpen, setTopiOpen] = useState(false);
  const [topiBusy, setTopiBusy] = useState<string | null>(null);
  const [topiMessage, setTopiMessage] = useState('Topi está aquí solo cuando tú lo necesites.');
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const adaptiveFields = useMemo(() => adaptiveFieldsFor(draft.categoria), [draft.categoria]);
  const serializedDescription = useMemo(() => formatListingDescription(draft.descripcion, draft, adaptive), [draft, adaptive]);
  const serializedDraft = useMemo(() => ({ ...draft, descripcion: serializedDescription, imagen_url: images[0], imagenes_url: images }), [draft, serializedDescription, images]);
  const issues = useMemo(() => reviewProductDraft(serializedDraft), [serializedDraft]);
  const quality = useMemo(() => publicationQuality(serializedDraft) + Math.min(10, Object.values(adaptive).filter((value) => value.trim()).length * 2), [serializedDraft, adaptive]);
  const visibleQuality = Math.min(100, quality);
  const suggestedScope = defaultScopeForCategory(draft.categoria);
  const selectedScope = (draft.visibility_scope || suggestedScope) as ListingVisibilityScope;
  const requiredReady = Boolean(draft.titulo?.trim() && draft.precio_mxn && draft.categoria && draft.punto_encuentro && draft.facultad);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({ mode, draft, images, adaptive }));
        setSavedAt('Borrador guardado');
      } catch { setSavedAt(null); }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [mode, draft, images, adaptive]);

  useEffect(() => {
    if (!draft.categoria || draft.visibility_scope) return;
    setDraft((current) => ({ ...current, visibility_scope: defaultScopeForCategory(draft.categoria) }));
  }, [draft.categoria, draft.visibility_scope]);

  const update = <K extends keyof ProductFormData>(key: K, value: ProductFormData[K] | undefined) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setError(null);
  };

  const selectCategory = (category: ProductCategory) => {
    setDraft((current) => ({ ...current, categoria: category, visibility_scope: defaultScopeForCategory(category) }));
    setAdaptive({}); setError(null);
  };

  const toggleDeliveryMethod = (method: DeliveryMethod) => {
    const current = draft.metodos_entrega || [];
    update('metodos_entrega', current.includes(method) ? current.filter((item) => item !== method) : [...current, method]);
  };

  const handleFiles = async (files?: FileList | null) => {
    if (!files?.length) return;
    try {
      setImageBusy(true); setError(null);
      const remaining = Math.max(0, 4 - images.length);
      const selected = Array.from(files).slice(0, remaining);
      const compressed: string[] = [];
      for (const file of selected) compressed.push(await compressImageForFirestore(file, { maxDimension: 960, maxBytes: 82_000 }));
      setImages((current) => [...current, ...compressed].slice(0, 4)); feedbackTap();
    } catch (fileError) {
      setError(fileError instanceof Error ? fileError.message : 'No pudimos procesar esa imagen.'); feedbackError();
    } finally {
      setImageBusy(false); if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const movePhoto = (from: number, to: number) => {
    if (to < 0 || to >= images.length || from === to) return;
    setImages((current) => { const next = [...current]; const [photo] = next.splice(from, 1); next.splice(to, 0, photo); return next; });
    feedbackTap();
  };

  const ask = async (action: 'category' | 'description' | 'price' | 'review') => {
    try {
      setTopiOpen(true); setTopiBusy(action); setError(null);
      const result = await askTopi(action, { draft: serializedDraft, products });
      const localLabel = result.source === 'local' ? 'sin costo' : 'IA conectada';
      if (action === 'category') {
        if (result.category) { selectCategory(result.category); setTopiMessage(`Te sugiero “${result.category}”. La dejé seleccionada, pero tú puedes cambiarla. · ${localLabel}`); }
        else setTopiMessage('Escribe un título un poco más específico y vuelvo a intentarlo.');
      }
      if (action === 'description' && result.description) { update('descripcion', result.description); setTopiMessage(`Mejoré la descripción sin publicar nada por ti. Revísala y cámbiala libremente. · ${localLabel}`); }
      if (action === 'price') {
        if (result.priceSuggestion) { const { low, high, median, samples } = result.priceSuggestion; setTopiMessage(`Encontré ${samples} anuncios comparables. Rango orientativo: $${low.toLocaleString('es-MX')}–$${high.toLocaleString('es-MX')}; punto medio $${median.toLocaleString('es-MX')}.`); }
        else setTopiMessage('Aún no hay suficientes publicaciones comparables para sugerir un precio responsable.');
      }
      if (action === 'review') { const reviewIssues = result.issues || []; setTopiMessage(reviewIssues.length ? `Puedes mejorar esto: ${reviewIssues.join(' · ')}` : 'Todo se ve bien. El anuncio tiene los datos principales y está listo para vista previa.'); }
    } catch { setTopiMessage('Topi no pudo ayudarte esta vez, pero puedes seguir publicando manualmente sin problema.'); }
    finally { setTopiBusy(null); }
  };

  const openPreview = () => {
    if (isForbiddenProductText(`${draft.titulo || ''} ${serializedDescription}`)) { setError('Ese anuncio parece incluir algo que no está permitido en TuTop. Revisa el título o la descripción.'); feedbackError(); return; }
    if (!requiredReady) { setError('Para continuar solo faltan: título, precio, categoría y forma de entrega.'); feedbackError(); return; }
    if (selectedScope === 'national' && !draft.shipping_available) { setError('Para publicar en Todo México debes indicar que el artículo admite envío.'); feedbackError(); return; }
    setShowPreview(true);
  };

  const resetDraft = () => { setDraft(emptyDraft(user.facultad)); setAdaptive({}); setImages([]); setMode('quick'); localStorage.removeItem(DRAFT_KEY); };

  const handlePublish = async (impulsar: boolean) => {
    if (!draft.titulo || !draft.precio_mxn || !draft.categoria || !draft.facultad || !draft.punto_encuentro || publishing) return;
    setPublishing(true); setError(null);
    const identity = user.university;
    const product: Product = {
      id: `prod-${crypto.randomUUID ? crypto.randomUUID() : Date.now()}`,
      vendedor_id: user.id,
      vendedor_nombre: user.nombre,
      vendedor_handle: `@${user.nombre.toLowerCase().replace(/[^a-z0-9áéíóúñ]+/gi, '.').replace(/^\.|\.$/g, '') || 'estudiante'}`,
      vendedor_verificado: user.esta_verificado,
      titulo: draft.titulo.trim().slice(0, 120),
      descripcion: serializedDescription,
      precio_mxn: Number(draft.precio_mxn),
      precio_negociable: Boolean(draft.precio_negociable),
      stock: Math.max(1, Number(draft.stock || 1)),
      categoria: draft.categoria,
      condicion: draft.condicion,
      marca: draft.marca,
      modelo: draft.modelo,
      talla: draft.talla,
      color: draft.color,
      etiquetas: draft.etiquetas,
      facultad: draft.facultad,
      country_code: 'MX',
      state_code: identity?.state_code,
      city_id: identity?.city_id,
      city_name: identity?.city_name,
      institution_id: user.institution_id || identity?.institution_id,
      campus_id: user.campus_id || identity?.campus_id,
      faculty_id: user.faculty_id || identity?.faculty_id,
      career_id: user.career_id || identity?.career_id,
      visibility_scope: selectedScope,
      listing_kind: 'offer',
      punto_encuentro: draft.punto_encuentro,
      metodos_entrega: draft.metodos_entrega,
      horario_entrega: draft.horario_entrega,
      disponibilidad: draft.disponibilidad,
      shipping_available: Boolean(draft.shipping_available),
      imagen_url: images[0] || fallbackImage,
      imagenes_url: images.length ? images : undefined,
      estado: 'Activo', es_top: false, jerarquia_top: 0, puja_ucoins: 0, likes: 0,
      fecha_creacion: new Date().toISOString(),
    };
    const ok = await publishProduct(product, impulsar ? 5 : 0);
    if (ok && nationalSchemaEnabled()) {
      try {
        await nationalBackend.enrichListing(product.id, {
          country_code: 'MX', state_code: product.state_code, city_id: product.city_id, city_name: product.city_name,
          institution_id: product.institution_id, campus_id: product.campus_id, faculty_id: product.faculty_id, career_id: product.career_id,
          visibility_scope: product.visibility_scope, listing_kind: 'offer', shipping_available: product.shipping_available,
        });
      } catch { /* legacy publication remains valid if enrichment fails */ }
    }
    setPublishing(false);
    if (!ok) { setError(syncError ? 'No pudimos publicar. Revisa tu conexión e inténtalo otra vez.' : 'No pudimos publicar en este momento.'); feedbackError(); return; }
    feedbackSuccess(); setShowPreview(false); resetDraft();
    setTopiMessage(impulsar ? 'Publicado e impulsado. ¡Ya compite por el Top de la semana! ✨' : `Publicado para ${VISIBILITY_SCOPES.find((item) => item.id === selectedScope)?.label || 'tu comunidad'}. ✨`);
    setTopiOpen(true); window.setTimeout(() => setActiveTab('feed'), 700);
  };

  return (
    <div className="publish-screen pb-[calc(82px+env(safe-area-inset-bottom))]">
      <header className="publish-header pt-safe"><button onClick={() => setActiveTab('feed')} className="icon-button-lg" aria-label="Volver"><ArrowLeft className="h-5 w-5" /></button><div className="min-w-0 flex-1"><h1 className="text-[18px] font-black">Vender en TuTop</h1><p className="mt-0.5 text-[10px] text-slate-500">Simple primero. Detalles solo si te sirven.</p></div><button onClick={() => setTopiOpen((value) => !value)} className={`topi-button ${topiOpen ? 'topi-button-active' : ''}`}><Sparkles className="h-4 w-4" />Topi</button></header>

      <main className="page-pad pt-3">
        <div className="grid grid-cols-2 gap-2 rounded-2xl bg-white/[0.035] p-1.5"><button onClick={() => setMode('quick')} className={`rounded-xl px-3 py-3 text-left ${mode === 'quick' ? 'bg-violet-600/25 ring-1 ring-violet-400/20' : ''}`}><strong className="block text-xs">Publicación rápida</strong><span className="mt-1 block text-[9px] text-slate-500">Foto, nombre, precio y listo.</span></button><button onClick={() => setMode('detailed')} className={`rounded-xl px-3 py-3 text-left ${mode === 'detailed' ? 'bg-violet-600/25 ring-1 ring-violet-400/20' : ''}`}><strong className="block text-xs">Más detalles</strong><span className="mt-1 block text-[9px] text-slate-500">Campos que cambian según lo que vendes.</span></button></div>
        <div className="mt-2 flex items-center justify-between text-[9px] text-slate-600"><span className="inline-flex items-center gap-1"><Save className="h-3 w-3" />{savedAt || 'El borrador se guarda en este dispositivo'}</span><span>{visibleQuality}% completo</span></div><div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/5"><div className="h-full rounded-full bg-violet-500 transition-all" style={{ width: `${visibleQuality}%` }} /></div>

        <section className="publish-card mt-3"><div className="flex items-center justify-between gap-3"><div><p className="eyebrow">1 · FOTOS</p><h2 className="mt-1 text-sm font-black">Que se entienda a primera vista</h2></div><span className="text-[10px] font-bold text-slate-600">{images.length}/4</span></div><input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(event) => void handleFiles(event.target.files)} /><div className="mt-3 grid grid-cols-4 gap-2">{images.map((image, index) => <div key={`${image.slice(0, 30)}-${index}`} className="publish-photo relative"><img src={image} alt={`Foto ${index + 1}`} /><button onClick={() => setImages((current) => current.filter((_, photoIndex) => photoIndex !== index))} aria-label="Quitar foto"><X /></button>{index === 0 && <span>PORTADA</span>}<div className="absolute inset-x-1 bottom-1 flex justify-between gap-1">{index > 0 && <button type="button" onClick={() => movePhoto(index, index - 1)} className="!static !h-6 !w-6 rounded-full bg-black/65" aria-label="Mover foto a la izquierda"><ArrowLeftRight className="h-3 w-3" /></button>}{index < images.length - 1 && <button type="button" onClick={() => movePhoto(index, index + 1)} className="!static !ml-auto !h-6 !w-6 rounded-full bg-black/65" aria-label="Mover foto a la derecha"><ArrowLeftRight className="h-3 w-3 rotate-180" /></button>}</div></div>)}{images.length < 4 && <button disabled={imageBusy} onClick={() => fileInputRef.current?.click()} className="publish-photo-add">{imageBusy ? <Loader2 className="animate-spin" /> : <Plus />}<small>Agregar</small></button>}</div><div className="mt-2 flex items-center gap-1.5 text-[9px] text-slate-600"><Camera className="h-3.5 w-3.5" />Puedes seleccionar varias y ordenar cuál será portada.</div></section>

        <section className="publish-card mt-3"><p className="eyebrow">2 · LO ESENCIAL</p><label className="publish-label">¿Qué vendes?</label><input value={draft.titulo || ''} onChange={(event) => update('titulo', event.target.value)} className="publish-input" maxLength={120} placeholder="Ej. Calculadora Casio científica" /><div className="mt-3 grid grid-cols-[.7fr_.45fr_1.2fr] gap-2"><div><label className="publish-label mt-0">Precio</label><div className="relative"><span className="absolute left-3 top-3 text-sm font-black text-emerald-300">$</span><input value={draft.precio_mxn || ''} onChange={(event) => update('precio_mxn', event.target.value ? Math.max(0, Number(event.target.value)) : undefined)} className="publish-input pl-7" inputMode="decimal" type="number" min="1" max="1000000" placeholder="0" /></div></div><div><label className="publish-label mt-0">Cant.</label><input value={draft.stock || 1} onChange={(event) => update('stock', Math.max(1, Math.min(99, Number(event.target.value) || 1)))} className="publish-input" inputMode="numeric" type="number" min="1" max="99" /></div><div><label className="publish-label mt-0">Categoría</label><div className="relative"><select value={draft.categoria || ''} onChange={(event) => selectCategory(event.target.value as ProductCategory)} className="publish-input appearance-none pr-9"><option value="" disabled>Elige una</option>{MARKETPLACE_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}</select><ChevronDown className="pointer-events-none absolute right-3 top-3.5 h-4 w-4 text-slate-600" /></div></div></div><label className="publish-label">¿Dónde pueden recibirlo?</label><div className="grid grid-cols-2 gap-2">{VALID_MEETING_POINTS.map((point) => <button key={point} onClick={() => update('punto_encuentro', point)} className={`meeting-option ${draft.punto_encuentro === point ? 'meeting-option-active' : ''}`}>{draft.punto_encuentro === point && <CheckCircle2 />}{point}</button>)}</div></section>

        <section className="publish-card mt-3"><p className="eyebrow">3 · ALCANCE</p><h2 className="mt-1 text-sm font-black">¿Hasta dónde tiene sentido mostrarlo?</h2><p className="mt-1 text-[9px] leading-4 text-slate-600">TuTop recomienda un alcance según la categoría. Tú decides.</p><div className="mt-3 grid grid-cols-1 gap-2">{VISIBILITY_SCOPES.map((scope) => <button key={scope.id} type="button" onClick={() => update('visibility_scope', scope.id)} className={`rounded-xl border p-3 text-left ${selectedScope === scope.id ? 'border-violet-400/20 bg-violet-500/10' : 'border-white/5 bg-white/[0.025]'}`}><div className="flex items-center justify-between gap-2"><strong className="text-[10px]">{scope.label}</strong>{scope.id === suggestedScope && <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[8px] font-bold text-emerald-300">Recomendado</span>}</div><p className="mt-1 text-[9px] text-slate-600">{scope.hint}</p></button>)}</div>{selectedScope === 'national' && <label className="mt-3 flex items-center justify-between rounded-xl border border-amber-300/10 bg-amber-500/[0.05] px-3 py-3 text-xs"><span><strong className="block text-amber-100">Disponible para envío</strong><small className="text-slate-600">Necesario para mostrar el artículo en Todo México.</small></span><input type="checkbox" checked={Boolean(draft.shipping_available)} onChange={(event) => update('shipping_available', event.target.checked)} /></label>}</section>

        <AnimatePresence initial={false}>{mode === 'detailed' && <motion.section initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden"><div className="publish-card mt-3"><p className="eyebrow">4 · DETALLES OPCIONALES</p><label className="publish-label">Descripción</label><textarea value={draft.descripcion || ''} onChange={(event) => update('descripcion', event.target.value)} className="publish-textarea" maxLength={650} rows={4} placeholder="Cuenta lo importante sin escribir de más…" /><label className="publish-label">Estado</label><div className="chips-row">{conditions.map((condition) => <button key={condition} onClick={() => update('condicion', condition)} className={`filter-chip ${draft.condicion === condition ? 'filter-chip-active' : ''}`}>{condition}</button>)}</div><div className="mt-3 grid grid-cols-2 gap-2"><input value={draft.marca || ''} onChange={(event) => update('marca', event.target.value.slice(0, 60))} className="publish-input" placeholder="Marca (opcional)" /><input value={draft.modelo || ''} onChange={(event) => update('modelo', event.target.value.slice(0, 60))} className="publish-input" placeholder="Modelo (opcional)" /><input value={draft.talla || ''} onChange={(event) => update('talla', event.target.value.slice(0, 50))} className="publish-input" placeholder="Talla / medida" /><input value={draft.color || ''} onChange={(event) => update('color', event.target.value.slice(0, 40))} className="publish-input" placeholder="Color" /></div>{adaptiveFields.length > 0 && <div className="mt-4 rounded-2xl border border-violet-400/10 bg-violet-500/[0.04] p-3"><div className="mb-2"><strong className="text-[11px]">Detalles para {draft.categoria}</strong><p className="mt-0.5 text-[9px] text-slate-600">Solo aparecen los datos que pueden ayudar en esta categoría.</p></div><div className="grid grid-cols-2 gap-2">{adaptiveFields.map((field) => <div key={field.key}><label className="mb-1 block text-[9px] font-bold text-slate-500">{field.label}</label><input value={adaptive[field.key] || ''} onChange={(event) => setAdaptive((current) => ({ ...current, [field.key]: event.target.value.slice(0, 100) }))} inputMode={field.inputMode || 'text'} className="publish-input" placeholder={field.placeholder} /></div>)}</div></div>}<label className="mt-3 flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.025] px-3 py-3 text-xs"><span><strong className="block">Precio negociable</strong><small className="text-slate-600">El comprador sabrá que puede hacer una oferta.</small></span><input type="checkbox" checked={Boolean(draft.precio_negociable)} onChange={(event) => update('precio_negociable', event.target.checked)} /></label><label className="publish-label">Formas de entrega</label><div className="chips-row">{deliveryMethods.map((method) => <button key={method} onClick={() => toggleDeliveryMethod(method)} className={`filter-chip ${draft.metodos_entrega?.includes(method) ? 'filter-chip-active' : ''}`}>{method}</button>)}</div><input value={draft.punto_personalizado || ''} onChange={(event) => update('punto_personalizado', event.target.value.slice(0, 120))} className="publish-input mt-3" placeholder="Otro lugar público o referencia (opcional)" /><input value={draft.horario_entrega || ''} onChange={(event) => update('horario_entrega', event.target.value.slice(0, 100))} className="publish-input mt-2" placeholder="Horario, ej. L–V 11:00–14:00" /><input value={draft.disponibilidad || ''} onChange={(event) => update('disponibilidad', event.target.value.slice(0, 120))} className="publish-input mt-2" placeholder="Disponibilidad, ej. hoy después de las 3" /><input value={(draft.etiquetas || []).join(', ')} onChange={(event) => update('etiquetas', event.target.value.split(',').map((tag) => tag.trim()).filter(Boolean).slice(0, 6))} className="publish-input mt-2" placeholder="Etiquetas separadas por coma" /></div></motion.section>}</AnimatePresence>

        <section className="publish-card mt-3"><div className="flex items-center gap-2"><div className="grid h-9 w-9 place-items-center rounded-xl bg-violet-500/10 text-violet-300"><WandSparkles className="h-4 w-4" /></div><div className="flex-1"><p className="text-xs font-black">Topi solo cuando tú quieras</p><p className="text-[9px] text-slate-600">Sugiere; nunca publica ni decide por ti.</p></div></div><div className="mt-3 grid grid-cols-2 gap-2"><AssistButton busy={topiBusy === 'category'} onClick={() => void ask('category')} icon={<Sparkles />} label="Sugerir categoría" /><AssistButton busy={topiBusy === 'description'} onClick={() => void ask('description')} icon={<WandSparkles />} label="Mejorar descripción" /><AssistButton busy={topiBusy === 'price'} onClick={() => void ask('price')} icon={<Lightbulb />} label="Orientar precio" /><AssistButton busy={topiBusy === 'review'} onClick={() => void ask('review')} icon={<CheckCircle2 />} label="Revisar anuncio" /></div><AnimatePresence>{topiOpen && <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden"><div className="topi-message"><span className="brand-mini">T</span><p>{topiMessage}</p></div></motion.div>}</AnimatePresence></section>

        {issues.length > 0 && mode === 'detailed' && <div className="mt-3 rounded-2xl border border-white/5 bg-white/[0.025] p-3 text-[10px] text-slate-500"><strong className="text-slate-300">Para mejorar tu anuncio</strong><p className="mt-1 leading-5">{issues.slice(0, 3).join(' · ')}</p></div>}{error && <div className="mt-3 rounded-2xl border border-rose-400/15 bg-rose-500/10 p-3 text-xs text-rose-200">{error}</div>}<div className="mt-4 grid grid-cols-[.45fr_1fr] gap-2"><button onClick={resetDraft} className="rounded-2xl border border-white/5 bg-white/[0.025] py-3 text-xs font-bold text-slate-400">Limpiar</button><button disabled={!requiredReady || publishing} onClick={openPreview} className="rounded-2xl bg-gradient-to-r from-violet-600 to-fuchsia-600 py-3 text-sm font-black disabled:opacity-40">{publishing ? 'Publicando…' : 'Así la verán'}</button></div>
      </main>

      <AnimatePresence>{showPreview && requiredReady && <PreviewModal formData={{ ...(serializedDraft as ProductFormData), titulo: draft.titulo!, precio_mxn: Number(draft.precio_mxn), categoria: draft.categoria!, facultad: draft.facultad!, punto_encuentro: draft.punto_encuentro!, visibility_scope: selectedScope }} onClose={() => setShowPreview(false)} onPublish={(impulsar) => void handlePublish(impulsar)} />}</AnimatePresence>
    </div>
  );
}

function AssistButton({ busy, onClick, icon, label }: { busy: boolean; onClick: () => void; icon: ReactNode; label: string }) {
  return <button disabled={busy} onClick={onClick} className="assist-button">{busy ? <Loader2 className="animate-spin" /> : icon}<span>{label}</span></button>;
}
