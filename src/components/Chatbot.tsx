import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, Camera, CheckCircle2, ChevronDown, Lightbulb, Loader2, Plus, Save, Sparkles, WandSparkles, X } from 'lucide-react';
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
import TopiMascot from './TopiMascot';

const DRAFT_KEY = 'tutop.publish.draft.v4';
const fallbackImage = `data:image/svg+xml;charset=utf-8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600"><rect width="900" height="600" fill="#111827"/><text x="450" y="310" text-anchor="middle" fill="#c4b5fd" font-size="42" font-family="Arial">TuTop</text></svg>')}`;
const conditions: ProductCondition[] = ['Nuevo', 'Como nuevo', 'Buen estado', 'Uso visible', 'Para reparar', 'No aplica'];
const deliveryMethods: DeliveryMethod[] = ['Nos encontramos', 'Recoge conmigo', 'Yo entrego', 'Acordamos por chat', 'Envío local', 'Punto TuTop'];
const emptyDraft = (faculty: string): Partial<ProductFormData> => ({ facultad: faculty, punto_encuentro: 'Coordinar por Chat', stock: 1, precio_negociable: false, shipping_available: false });

type StoredDraft = { draft?: Partial<ProductFormData>; images?: string[]; adaptive?: Record<string, string> };
function safeStoredDraft(faculty: string) {
  try {
    const parsed = JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}') as StoredDraft;
    return {
      draft: { ...emptyDraft(faculty), ...(parsed.draft || {}), facultad: faculty },
      images: Array.isArray(parsed.images) ? parsed.images.filter((value) => typeof value === 'string' && value.startsWith('data:image/')).slice(0, 4) : [],
      adaptive: parsed.adaptive && typeof parsed.adaptive === 'object' ? parsed.adaptive : {},
    };
  } catch { return { draft: emptyDraft(faculty), images: [] as string[], adaptive: {} as Record<string, string> }; }
}

export default function Chatbot() {
  const { publishProduct, user, setActiveTab, syncError, products } = useAppStore();
  const initial = useMemo(() => safeStoredDraft(user.facultad), [user.facultad]);
  const [draft, setDraft] = useState<Partial<ProductFormData>>(initial.draft);
  const [adaptive, setAdaptive] = useState<Record<string, string>>(initial.adaptive);
  const [images, setImages] = useState<string[]>(initial.images);
  const [imageBusy, setImageBusy] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [topiOpen, setTopiOpen] = useState(false);
  const [topiBusy, setTopiBusy] = useState<string | null>(null);
  const [topiMessage, setTopiMessage] = useState('Topi está aquí cuando lo necesites.');
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const adaptiveFields = useMemo(() => adaptiveFieldsFor(draft.categoria), [draft.categoria]);
  const serializedDescription = useMemo(() => formatListingDescription(draft.descripcion, draft, adaptive), [draft, adaptive]);
  const serializedDraft = useMemo(() => ({ ...draft, descripcion: serializedDescription, imagen_url: images[0], imagenes_url: images }), [draft, serializedDescription, images]);
  const issues = useMemo(() => reviewProductDraft(serializedDraft), [serializedDraft]);
  const quality = Math.min(100, publicationQuality(serializedDraft) + Math.min(10, Object.values(adaptive).filter((value) => value.trim()).length * 2));
  const suggestedScope = defaultScopeForCategory(draft.categoria);
  const selectedScope = (draft.visibility_scope || suggestedScope) as ListingVisibilityScope;
  const requiredReady = Boolean(draft.titulo?.trim() && draft.precio_mxn && draft.categoria && draft.punto_encuentro && draft.facultad);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ draft, images, adaptive })); } catch { /* optional */ }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [draft, images, adaptive]);

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
      const compressed: string[] = [];
      for (const file of Array.from(files).slice(0, remaining)) compressed.push(await compressImageForFirestore(file, { maxDimension: 960, maxBytes: 82_000 }));
      setImages((current) => [...current, ...compressed].slice(0, 4)); feedbackTap();
    } catch (fileError) { setError(fileError instanceof Error ? fileError.message : 'No pudimos procesar esa imagen.'); feedbackError(); }
    finally { setImageBusy(false); if (fileInputRef.current) fileInputRef.current.value = ''; }
  };

  const ask = async (action: 'category' | 'description' | 'price' | 'review') => {
    try {
      setTopiOpen(true); setTopiBusy(action); setError(null);
      const result = await askTopi(action, { draft: serializedDraft, products });
      const source = result.source === 'local' ? 'Topi local $0' : 'Topi IA conectada';
      if (action === 'category') {
        if (result.category) { selectCategory(result.category); setTopiMessage(`Te sugiero “${result.category}”. · ${source}`); }
        else setTopiMessage('Escribe un título más específico y vuelvo a intentarlo.');
      }
      if (action === 'description' && result.description) { update('descripcion', result.description); setTopiMessage(`Mejoré la descripción. Revísala antes de publicar. · ${source}`); }
      if (action === 'price') setTopiMessage(result.priceSuggestion ? `Referencia: $${result.priceSuggestion.low.toLocaleString('es-MX')}–$${result.priceSuggestion.high.toLocaleString('es-MX')} con ${result.priceSuggestion.samples} comparables.` : 'Aún no hay suficientes comparables reales.');
      if (action === 'review') setTopiMessage(result.issues?.length ? `Puedes mejorar: ${result.issues.join(' · ')}` : 'El anuncio tiene lo principal para continuar.');
    } catch { setTopiMessage('Topi no pudo ayudarte esta vez; puedes seguir manualmente.'); }
    finally { setTopiBusy(null); }
  };

  const openPreview = () => {
    if (isForbiddenProductText(`${draft.titulo || ''} ${serializedDescription}`)) { setError('Ese anuncio parece incluir algo que no está permitido en TuTop.'); feedbackError(); return; }
    if (!requiredReady) { setError('Faltan título, precio, categoría o punto de encuentro.'); feedbackError(); return; }
    setShowPreview(true);
  };

  const resetDraft = () => { setDraft(emptyDraft(user.facultad)); setAdaptive({}); setImages([]); localStorage.removeItem(DRAFT_KEY); };

  const handlePublish = async (impulsar: boolean) => {
    if (!draft.titulo || !draft.precio_mxn || !draft.categoria || !draft.facultad || !draft.punto_encuentro || publishing) return;
    setPublishing(true); setError(null);
    const identity = user.university;
    const product: Product = {
      id: `prod-${crypto.randomUUID ? crypto.randomUUID() : Date.now()}`,
      vendedor_id: user.id, vendedor_nombre: user.nombre,
      vendedor_handle: `@${user.nombre.toLowerCase().replace(/[^a-z0-9áéíóúñ]+/gi, '.').replace(/^\.|\.$/g, '') || 'estudiante'}`,
      vendedor_verificado: user.esta_verificado,
      titulo: draft.titulo.trim().slice(0, 120), descripcion: serializedDescription,
      precio_mxn: Number(draft.precio_mxn), precio_negociable: Boolean(draft.precio_negociable), stock: Math.max(1, Number(draft.stock || 1)),
      categoria: draft.categoria, condicion: draft.condicion, marca: draft.marca, modelo: draft.modelo, talla: draft.talla, color: draft.color, etiquetas: draft.etiquetas,
      facultad: draft.facultad, country_code: 'MX', state_code: identity?.state_code, city_id: identity?.city_id, city_name: identity?.city_name,
      institution_id: user.institution_id || identity?.institution_id, campus_id: user.campus_id || identity?.campus_id,
      faculty_id: user.faculty_id || identity?.faculty_id, career_id: user.career_id || identity?.career_id,
      visibility_scope: selectedScope, listing_kind: 'offer', punto_encuentro: draft.punto_encuentro,
      metodos_entrega: draft.metodos_entrega, horario_entrega: draft.horario_entrega, disponibilidad: draft.disponibilidad,
      shipping_available: Boolean(draft.shipping_available), imagen_url: images[0] || fallbackImage, imagenes_url: images.length ? images : undefined,
      estado: 'Activo', es_top: false, jerarquia_top: 0, puja_ucoins: 0, likes: 0, fecha_creacion: new Date().toISOString(),
    };
    const ok = await publishProduct(product, impulsar ? 5 : 0);
    if (ok && nationalSchemaEnabled()) {
      try { await nationalBackend.enrichListing(product.id, { country_code: 'MX', state_code: product.state_code, city_id: product.city_id, city_name: product.city_name, institution_id: product.institution_id, campus_id: product.campus_id, faculty_id: product.faculty_id, career_id: product.career_id, visibility_scope: product.visibility_scope, listing_kind: 'offer', shipping_available: product.shipping_available }); } catch { /* legacy enrichment optional */ }
    }
    setPublishing(false);
    if (!ok) { setError(syncError ? 'No pudimos publicar. Revisa tu conexión.' : 'No pudimos publicar en este momento.'); feedbackError(); return; }
    feedbackSuccess(); setShowPreview(false); resetDraft(); setActiveTab('feed');
  };

  return <div className="publish-screen pb-[calc(82px+env(safe-area-inset-bottom))]">
    <header className="publish-header pt-safe"><button onClick={() => setActiveTab('feed')} className="icon-button-lg" aria-label="Volver"><ArrowLeft className="h-5 w-5" /></button><div className="min-w-0 flex-1"><h1 className="text-[18px] font-black">Vender en TuTop</h1><p className="mt-0.5 text-[10px] text-slate-500">Acuerdo directo entre comprador y vendedor.</p></div><button onClick={() => setTopiOpen((value) => !value)} className={`topi-button ${topiOpen ? 'topi-button-active' : ''}`}><Sparkles className="h-4 w-4" />Topi</button></header>
    <main className="page-pad pt-3 space-y-3">
      <div className="flex items-center justify-between text-[9px] text-slate-600"><span className="inline-flex items-center gap-1"><Save className="h-3 w-3" />Borrador local</span><span>{quality}% completo</span></div><div className="h-1.5 overflow-hidden rounded-full bg-white/5"><div className="h-full rounded-full bg-violet-500" style={{ width: `${quality}%` }} /></div>

      <section className="publish-card"><div className="flex items-center justify-between"><div><p className="eyebrow">FOTOS</p><h2 className="mt-1 text-sm font-black">Hasta 4 imágenes</h2></div><Camera className="h-4 w-4 text-violet-300" /></div><input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(event) => void handleFiles(event.target.files)} /><div className="mt-3 grid grid-cols-4 gap-2">{images.map((image, index) => <div key={index} className="publish-photo relative"><img src={image} alt={`Foto ${index + 1}`} /><button onClick={() => setImages((current) => current.filter((_, i) => i !== index))}><X /></button></div>)}{images.length < 4 && <button disabled={imageBusy} onClick={() => fileInputRef.current?.click()} className="publish-photo-add">{imageBusy ? <Loader2 className="animate-spin" /> : <Plus />}<small>Agregar</small></button>}</div></section>

      <section className="publish-card"><p className="eyebrow">LO ESENCIAL</p><label className="publish-label">¿Qué vendes?</label><input value={draft.titulo || ''} onChange={(event) => update('titulo', event.target.value.slice(0, 120))} className="publish-input" placeholder="Ej. Calculadora Casio científica" /><div className="mt-2 grid grid-cols-2 gap-2"><input value={draft.precio_mxn || ''} onChange={(event) => update('precio_mxn', event.target.value ? Number(event.target.value) : undefined)} className="publish-input" type="number" min="1" placeholder="Precio MXN" /><div className="relative"><select value={draft.categoria || ''} onChange={(event) => selectCategory(event.target.value as ProductCategory)} className="publish-input appearance-none pr-9"><option value="">Categoría</option>{MARKETPLACE_CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select><ChevronDown className="pointer-events-none absolute right-3 top-3.5 h-4 w-4 text-slate-600" /></div></div><label className="publish-label">Punto de encuentro</label><div className="grid grid-cols-2 gap-2">{VALID_MEETING_POINTS.map((point) => <button key={point} onClick={() => update('punto_encuentro', point)} className={`meeting-option ${draft.punto_encuentro === point ? 'meeting-option-active' : ''}`}>{point}</button>)}</div></section>

      <section className="publish-card"><p className="eyebrow">ALCANCE</p><div className="mt-2 grid gap-2">{VISIBILITY_SCOPES.map((item) => <button key={item.id} type="button" onClick={() => update('visibility_scope', item.id)} className={`rounded-xl border p-3 text-left ${selectedScope === item.id ? 'border-violet-400/20 bg-violet-500/10' : 'border-white/5 bg-white/[0.025]'}`}><strong className="text-[10px]">{item.label}</strong><p className="mt-1 text-[9px] text-slate-600">{item.hint}</p></button>)}</div><div className="mt-3 rounded-xl bg-sky-500/[0.05] p-3 text-[9px] leading-4 text-sky-100/80"><strong>TuTop no hace envíos.</strong> El alcance nacional sólo amplía quién puede descubrir tu publicación. Si acuerdan mensajería o paquetería externa, comprador y vendedor la coordinan por su cuenta.</div><label className="mt-2 flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.025] px-3 py-3 text-xs"><span><strong className="block">Acepto coordinar envío externo</strong><small className="text-slate-600">Opcional. Nunca es un servicio de TuTop.</small></span><input type="checkbox" checked={Boolean(draft.shipping_available)} onChange={(event) => update('shipping_available', event.target.checked)} /></label></section>

      <section className="publish-card"><p className="eyebrow">DETALLES OPCIONALES</p><textarea value={draft.descripcion || ''} onChange={(event) => update('descripcion', event.target.value.slice(0, 650))} className="publish-textarea" rows={3} placeholder="Descripción" /><div className="mt-2 grid grid-cols-2 gap-2"><select className="publish-input" value={draft.condicion || ''} onChange={(event) => update('condicion', event.target.value as ProductCondition)}><option value="">Estado</option>{conditions.map((item) => <option key={item}>{item}</option>)}</select><label className="flex items-center gap-2 rounded-xl bg-white/[0.025] px-3 text-xs"><input type="checkbox" checked={Boolean(draft.precio_negociable)} onChange={(event) => update('precio_negociable', event.target.checked)} />Negociable</label></div>{adaptiveFields.length > 0 && <div className="mt-2 grid grid-cols-2 gap-2">{adaptiveFields.slice(0, 6).map((field) => <input key={field.key} value={adaptive[field.key] || ''} onChange={(event) => setAdaptive((current) => ({ ...current, [field.key]: event.target.value.slice(0, 100) }))} className="publish-input" placeholder={field.label} />)}</div>}<label className="publish-label">Cómo lo coordinan</label><div className="chips-row">{deliveryMethods.map((method) => <button key={method} onClick={() => toggleDeliveryMethod(method)} className={`filter-chip ${draft.metodos_entrega?.includes(method) ? 'filter-chip-active' : ''}`}>{method}</button>)}</div></section>

      <section className="publish-card"><div className="flex items-center gap-2"><TopiMascot className="h-10 w-10" /><div><strong className="text-xs">Topi</strong><p className="text-[9px] text-slate-600">Sugiere; nunca publica ni decide por ti.</p></div></div><div className="mt-3 grid grid-cols-2 gap-2"><AssistButton busy={topiBusy === 'category'} onClick={() => void ask('category')} icon={<Sparkles />} label="Categoría" /><AssistButton busy={topiBusy === 'description'} onClick={() => void ask('description')} icon={<WandSparkles />} label="Descripción" /><AssistButton busy={topiBusy === 'price'} onClick={() => void ask('price')} icon={<Lightbulb />} label="Precio" /><AssistButton busy={topiBusy === 'review'} onClick={() => void ask('review')} icon={<CheckCircle2 />} label="Revisar" /></div><AnimatePresence>{topiOpen && <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden"><div className="topi-message"><TopiMascot className="h-8 w-8 shrink-0" /><p>{topiMessage}</p></div></motion.div>}</AnimatePresence></section>

      {issues.length > 0 && <div className="rounded-2xl border border-white/5 bg-white/[0.025] p-3 text-[10px] text-slate-500">{issues.slice(0, 3).join(' · ')}</div>}{error && <div className="rounded-2xl border border-rose-400/15 bg-rose-500/10 p-3 text-xs text-rose-200">{error}</div>}<div className="grid grid-cols-[.45fr_1fr] gap-2"><button onClick={resetDraft} className="rounded-2xl border border-white/5 bg-white/[0.025] py-3 text-xs font-bold text-slate-400">Limpiar</button><button disabled={!requiredReady || publishing} onClick={openPreview} className="rounded-2xl bg-gradient-to-r from-violet-600 to-fuchsia-600 py-3 text-sm font-black disabled:opacity-40">{publishing ? 'Publicando…' : 'Así la verán'}</button></div>
    </main>
    <AnimatePresence>{showPreview && requiredReady && <PreviewModal formData={{ ...(serializedDraft as ProductFormData), titulo: draft.titulo!, precio_mxn: Number(draft.precio_mxn), categoria: draft.categoria!, facultad: draft.facultad!, punto_encuentro: draft.punto_encuentro!, visibility_scope: selectedScope }} onClose={() => setShowPreview(false)} onPublish={(impulsar) => void handlePublish(impulsar)} />}</AnimatePresence>
  </div>;
}

function AssistButton({ busy, onClick, icon, label }: { busy: boolean; onClick: () => void; icon: ReactNode; label: string }) {
  return <button disabled={busy} onClick={onClick} className="assist-button">{busy ? <Loader2 className="animate-spin" /> : icon}<span>{label}</span></button>;
}
