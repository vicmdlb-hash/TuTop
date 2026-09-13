import { useMemo, useRef, useState } from 'react';
import { ArrowLeft, Camera, CheckCircle2, ChevronDown, Images, Loader2, MapPin, Mic, Plus, ShieldCheck, Sparkles, X } from 'lucide-react';
import { compressImageForFirestore } from '../lib/imageCompression';
import { categorySafetyRequirements } from '../lib/marketplaceGovernance';
import { getCachedApproxLocation, locationAttributes, requestApproxLocation, type ApproxLocation } from '../lib/nearbyMarketplace';
import { nationalFieldsFor, normalizeNationalAttributes } from '../lib/nationalListingFields';
import type { CanonicalListingV2, ListingDeliveryMethod } from '../lib/listingSchemaV2';
import { smartPriceFromTuTop } from '../lib/smartPricing';
import { startTopiDictation } from '../lib/topiVoice';
import { isForbiddenProductText, MARKETPLACE_CATEGORIES } from '../lib/productAssistant';
import { defaultScopeForCategory, identityFor, safeMeetingPointsFor, VISIBILITY_SCOPES } from '../lib/universityNetwork';
import { canonicalListingsBackend } from '../services/canonicalListingsBackend';
import { askTopi } from '../services/assistantProvider';
import { nationalBackend } from '../services/nationalBackend';
import { isNativeDeviceRuntime, nativePhotoToImageFile, pickNativePhoto, takeNativePhoto } from '../services/nativeDeviceCapabilities';
import { useAppStore } from '../store/useAppStore';
import type { ListingVisibilityScope, Product, ProductCategory } from '../types';
import TopiMascot from './TopiMascot';

const FALLBACK_IMAGE = `data:image/svg+xml;charset=utf-8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600"><rect width="900" height="600" fill="#111827"/><text x="450" y="310" text-anchor="middle" fill="#c4b5fd" font-size="42" font-family="Arial">TuTop</text></svg>')}`;
const DELIVERY: Array<{ id: ListingDeliveryMethod; label: string }> = [
  { id: 'campus_meetup', label: 'Encuentro en campus' },
  { id: 'pickup', label: 'Recoger con vendedor' },
  { id: 'local_delivery', label: 'Entrega local acordada' },
  { id: 'shipping', label: 'Envío externo acordado' },
];

function slug(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export default function NationalPublishScreen() {
  const user = useAppStore((state) => state.user);
  const products = useAppStore((state) => state.products);
  const setActiveTab = useAppStore((state) => state.setActiveTab);
  const fileRef = useRef<HTMLInputElement>(null);
  const nativeDevice = isNativeDeviceRuntime();
  const [assistantText, setAssistantText] = useState('');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [category, setCategory] = useState<ProductCategory | ''>('');
  const [condition, setCondition] = useState('Buen estado');
  const [negotiable, setNegotiable] = useState(false);
  const [scope, setScope] = useState<ListingVisibilityScope>('campus');
  const [deliveryMethods, setDeliveryMethods] = useState<ListingDeliveryMethod[]>(['campus_meetup']);
  const [meetingPointId, setMeetingPointId] = useState('');
  const [attributes, setAttributes] = useState<Record<string, string | number | boolean>>({});
  const [images, setImages] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [topiBusy, setTopiBusy] = useState(false);
  const [topiSource, setTopiSource] = useState<'local' | 'topi-endpoint' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [voiceStatus, setVoiceStatus] = useState<'idle' | 'listening'>('idle');
  const [approxLocation, setApproxLocation] = useState<ApproxLocation | null>(() => getCachedApproxLocation());

  const institutionId = user.institution_id || user.university?.institution_id || '';
  const campusId = user.campus_id || user.university?.campus_id || '';
  const cityId = user.university?.city_id;
  const fields = useMemo(() => nationalFieldsFor(category || undefined), [category]);
  const safePoints = useMemo(() => safeMeetingPointsFor(campusId, institutionId), [campusId, institutionId]);
  const normalizedAttributes = useMemo(() => normalizeNationalAttributes(fields, attributes), [fields, attributes]);
  const required = useMemo(() => categorySafetyRequirements(category || undefined).required, [category]);
  const missing = required.filter((key) => normalizedAttributes[key] === undefined || normalizedAttributes[key] === null || normalizedAttributes[key] === '');
  const parsedPrice = Number(price);
  const hasValidPrice = price.trim() !== '' && Number.isFinite(parsedPrice) && parsedPrice > 0;
  const shippingAvailable = deliveryMethods.includes('shipping');
  const prohibitedDraft = isForbiddenProductText(`${title} ${description}`);
  const publishIssues: string[] = [];
  if (!institutionId || !campusId) publishIssues.push('universidad/campus');
  if (!title.trim()) publishIssues.push('título');
  if (!category) publishIssues.push('categoría');
  if (!hasValidPrice) publishIssues.push('precio mayor a $0');
  if (!deliveryMethods.length) publishIssues.push('forma de entrega');
  if (prohibitedDraft) publishIssues.push('artículo o servicio no permitido');
  if (missing.length) publishIssues.push(`${missing.length} dato${missing.length === 1 ? '' : 's'} obligatorio${missing.length === 1 ? '' : 's'}`);
  const readyToPublish = publishIssues.length === 0;

  const pricingTarget = useMemo<Product | null>(() => {
    if (!category) return null;
    return {
      id: 'pricing-draft', vendedor_id: user.id, vendedor_nombre: user.nombre, titulo: title || category,
      descripcion: description, precio_mxn: Number(price || 0), categoria: category, facultad: user.facultad,
      marca: typeof normalizedAttributes.brand === 'string' ? normalizedAttributes.brand : undefined,
      modelo: typeof normalizedAttributes.model === 'string' ? normalizedAttributes.model : undefined,
      attributes: normalizedAttributes, institution_id: institutionId || undefined, campus_id: campusId || undefined,
      city_id: cityId, visibility_scope: scope, punto_encuentro: 'Coordinar por Chat', imagen_url: FALLBACK_IMAGE,
      estado: 'Activo', es_top: false, jerarquia_top: 0, likes: 0, fecha_creacion: new Date().toISOString(),
    };
  }, [category, user.id, user.nombre, user.facultad, title, description, price, normalizedAttributes, institutionId, campusId, cityId, scope]);
  const pricing = useMemo(() => pricingTarget ? smartPriceFromTuTop(pricingTarget, products) : null, [pricingTarget, products]);

  const applyTopi = async () => {
    const text = assistantText.trim();
    if (text.length < 3) return setMessage('Cuéntale a Topi qué quieres vender en una frase.');
    if (isForbiddenProductText(text)) return setMessage('Ese tipo de artículo o servicio no está permitido en TuTop. No se creó ningún borrador.');

    setTopiBusy(true);
    setMessage(null);
    try {
      const result = await askTopi('compose', {
        prompt: text,
        products,
        draft: {
          titulo: title || undefined,
          descripcion: description || undefined,
          precio_mxn: hasValidPrice ? parsedPrice : undefined,
          categoria: category || undefined,
          precio_negociable: negotiable,
          visibility_scope: scope,
        },
      });
      const suggestion = result.compose;
      if (!suggestion) {
        setMessage('Topi no encontró datos seguros para completar. Puedes seguir manualmente.');
        return;
      }

      if (!title.trim() && suggestion.title) setTitle(suggestion.title);
      if (!price.trim() && suggestion.price) setPrice(String(suggestion.price));
      if (!description.trim() && suggestion.description) setDescription(suggestion.description);
      if (!category && suggestion.category) {
        setCategory(suggestion.category);
        setAttributes({});
      }
      if (condition === 'Buen estado' && suggestion.condition) setCondition(suggestion.condition);
      if (suggestion.negotiable !== undefined) setNegotiable(suggestion.negotiable);
      if (suggestion.visibilityScope) setScope(suggestion.visibilityScope);
      else if (!category && suggestion.category) setScope(defaultScopeForCategory(suggestion.category));
      if (suggestion.deliveryMethods?.length) setDeliveryMethods(suggestion.deliveryMethods);

      setTopiSource(result.source);
      setMessage(result.source === 'topi-endpoint'
        ? 'Topi IA completó el borrador con una respuesta remota sanitizada. Revisa todo antes de publicar.'
        : 'Topi local completó el borrador sin costo. Revisa todo antes de publicar.');
    } catch {
      setMessage('Topi no pudo completar el borrador esta vez. Puedes seguir publicando manualmente.');
    } finally {
      setTopiBusy(false);
    }
  };

  const startVoice = () => {
    startTopiDictation({
      onText: (text) => setAssistantText((current) => `${current}${current ? ' ' : ''}${text}`.slice(0, 700)),
      onStatus: (status) => {
        setVoiceStatus(status === 'listening' ? 'listening' : 'idle');
        if (status === 'unsupported') setMessage('El dictado por voz no está disponible en este dispositivo. Puedes seguir escribiendo.');
        if (status === 'error') setMessage('No pudimos usar el micrófono. Revisa el permiso y vuelve a intentarlo.');
      },
    });
  };

  const refreshLocation = async () => {
    setMessage('Obteniendo una ubicación aproximada…');
    const location = await requestApproxLocation({ requestPermission: true });
    setApproxLocation(location);
    setMessage(location
      ? 'Ubicación aproximada activada. TuTop guardará sólo precisión cercana a 1 km, nunca tu domicilio exacto.'
      : 'No se obtuvo ubicación. Tu anuncio seguirá funcionando por campus y ciudad.');
  };

  const addPhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    setMessage(null);
    try {
      const next: string[] = [];
      for (const file of Array.from(files).slice(0, Math.max(0, 4 - images.length))) {
        next.push(await compressImageForFirestore(file, { maxDimension: 960, maxBytes: 82_000 }));
      }
      setImages((current) => [...current, ...next].slice(0, 4));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No pudimos procesar las fotos.');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const addNativePhoto = async (source: 'camera' | 'photos') => {
    if (busy || images.length >= 4) return;
    setBusy(true);
    setMessage(null);
    try {
      const selected = source === 'camera' ? await takeNativePhoto() : await pickNativePhoto();
      if (!selected) {
        setMessage(source === 'camera' ? 'No se tomó ninguna foto.' : 'No se seleccionó ninguna foto.');
        return;
      }
      const file = await nativePhotoToImageFile(selected, `tutop-${source}-${Date.now()}.jpg`);
      const compressed = await compressImageForFirestore(file, { maxDimension: 960, maxBytes: 82_000 });
      setImages((current) => [...current, compressed].slice(0, 4));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No pudimos procesar la foto.');
    } finally {
      setBusy(false);
    }
  };

  const toggleDelivery = (method: ListingDeliveryMethod) => {
    setDeliveryMethods((current) => current.includes(method) ? current.filter((item) => item !== method) : [...current, method]);
  };

  const selectScope = (nextScope: ListingVisibilityScope) => setScope(nextScope);

  const publish = async () => {
    setMessage(null);
    if (!institutionId || !campusId) return setMessage('Primero selecciona tu universidad y campus.');
    if (!title.trim() || !category || !hasValidPrice) return setMessage('Completa título, categoría y un precio mayor a $0.');
    if (prohibitedDraft) return setMessage('Ese artículo o servicio no está permitido en TuTop. Revisa el título y la descripción.');
    if (!deliveryMethods.length) return setMessage('Selecciona al menos una forma de entrega.');
    if (missing.length) {
      setAdvancedOpen(true);
      return setMessage(`Faltan datos obligatorios: ${missing.join(', ')}.`);
    }
    setBusy(true);
    try {
      const identity = identityFor(
        institutionId,
        campusId,
        user.faculty_id || user.university?.faculty_id,
        user.career_id || user.university?.career_id,
      );
      await nationalBackend.updateUniversityIdentity(identity, user.facultad);

      const location = approxLocation || await requestApproxLocation({ requestPermission: true });
      if (location && !approxLocation) setApproxLocation(location);
      const now = new Date().toISOString();
      const listing: CanonicalListingV2 = {
        schema_version: 2, seller_id: user.id, institution_id: institutionId, campus_id: campusId, city_id: cityId,
        faculty_id: user.faculty_id || user.university?.faculty_id, career_id: user.career_id || user.university?.career_id,
        category_id: slug(category), title: title.trim().slice(0, 120), description: description.trim().slice(0, 3000),
        attributes: { ...normalizedAttributes, ...locationAttributes(location) }, price_mxn: Math.round(parsedPrice * 100) / 100, negotiable,
        quantity: Math.max(1, Math.min(99, Number(quantity) || 1)), condition, delivery_methods: deliveryMethods,
        meeting_point_ids: meetingPointId ? [meetingPointId] : [], shipping_available: shippingAvailable,
        photo_urls: images.length ? images : [FALLBACK_IMAGE], status: 'active', moderation_status: 'pending', visibility_scope: scope,
        published_at: now, created_at: now, updated_at: now,
      };
      await canonicalListingsBackend.create(listing, category);
      const refreshed = await canonicalListingsBackend.loadMarketplaceProducts({ campusId, institutionId, cityId, limitPerScope: 30 });
      useAppStore.setState({ products: refreshed });
      setMessage('Publicación creada y enviada a revisión. TuTop no gestiona envíos; cualquier entrega se acuerda directamente con el vendedor.');
      window.setTimeout(() => setActiveTab('feed'), 700);
    } catch (error) {
      const raw = error instanceof Error ? error.message : String(error);
      if (/Missing or insufficient permissions|PERMISSION_DENIED/i.test(raw)) {
        setMessage('No pudimos validar los permisos de tu cuenta para publicar. Tu universidad/campus se intentaron resincronizar; vuelve a intentarlo o reinicia sesión si persiste.');
      } else {
        setMessage(raw.startsWith('PROHIBITED_LISTING:') ? 'Ese artículo no está permitido en TuTop.' : raw.startsWith('PRIVATE_FIELD_EXPOSED:') ? 'Hay un dato privado que no debe publicarse.' : `No pudimos publicar: ${raw}`);
      }
    } finally {
      setBusy(false);
    }
  };

  return <div className="publish-screen pb-[calc(82px+env(safe-area-inset-bottom))]">
    <header className="publish-header pt-safe">
      <button onClick={() => setActiveTab('feed')} className="icon-button-lg"><ArrowLeft className="h-5 w-5" /></button>
      <div><h1 className="text-lg font-black">Publica fácil con Topi</h1><p className="text-[10px] text-slate-500">Topi entiende TuTop: venta local, campus y acuerdos directos.</p></div>
    </header>

    <main className="page-pad space-y-3 pt-3">
      <section className="publish-card border-violet-400/15 bg-violet-500/[0.05]">
        <div className="flex items-center gap-3">
          <TopiMascot className="h-12 w-12 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2"><strong className="text-xs">Topi te ayuda a publicar</strong>{topiSource && <span className={`rounded-full px-2 py-0.5 text-[8px] font-black ${topiSource === 'topi-endpoint' ? 'bg-emerald-500/10 text-emerald-300' : 'bg-violet-500/10 text-violet-300'}`}>{topiSource === 'topi-endpoint' ? 'IA conectada' : 'Local $0'}</span>}</div>
            <p className="mt-0.5 text-[9px] text-slate-500">Escribe o dicta una frase. Topi reconoce producto, precio, estado, encuentro y alcance.</p>
          </div>
        </div>
        <div className="relative mt-3">
          <textarea className="publish-textarea pr-12" rows={3} value={assistantText} onChange={(e) => setAssistantText(e.target.value.slice(0, 700))} placeholder="Ej. Vendo audífonos Sony como nuevos, $2,500 negociables, entrego cerca de Campus Ribereña." />
          <button type="button" onClick={startVoice} className={`absolute bottom-2 right-2 grid h-9 w-9 place-items-center rounded-xl ${voiceStatus === 'listening' ? 'bg-fuchsia-500 text-white' : 'bg-white/[0.06] text-violet-200'}`} aria-label="Dictar a Topi"><Mic className="h-4 w-4" /></button>
        </div>
        <button disabled={topiBusy} type="button" onClick={() => void applyTopi()} className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 py-3 text-xs font-black text-white disabled:opacity-60">{topiBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}{topiBusy ? 'Topi está preparando…' : 'Topi, prepara mi anuncio'}</button>
        <p className="mt-2 text-[8px] leading-4 text-slate-600">Las respuestas de IA se validan en el teléfono antes de modificar el formulario. Topi no recibe fotos, tokens ni ubicación exacta.</p>
      </section>

      <section className="publish-card">
        <div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-emerald-300" /><div className="min-w-0 flex-1"><strong className="text-xs">Cercanía para compradores</strong><p className="mt-1 text-[9px] text-slate-500">{approxLocation ? 'Ubicación aproximada activa (~1 km). Nunca se publica tu domicilio exacto.' : 'Actívala para aparecer en filtros de 5, 10, 25 y 50 km.'}</p></div><button type="button" onClick={() => void refreshLocation()} className="rounded-xl bg-emerald-500/10 px-3 py-2 text-[9px] font-bold text-emerald-200">{approxLocation ? 'Actualizar' : 'Activar'}</button></div>
      </section>

      <section className="publish-card"><strong className="text-xs">{user.university?.institution_name || institutionId || 'Elige tu universidad'}</strong><p className="mt-1 text-[9px] text-slate-500">{user.university?.campus_name || campusId || 'Falta campus'}{user.university?.career_name ? ` · ${user.university.career_name}` : ''}</p></section>

      <section className="publish-card">
        <div className="flex items-center justify-between gap-2">
          <div><p className="eyebrow">FOTOS</p><p className="mt-1 text-[8px] text-slate-600">Máximo 4 · TuTop comprime antes de guardar.</p></div>
          <div className="flex gap-2">
            {nativeDevice ? <>
              <button disabled={busy || images.length >= 4} type="button" onClick={() => void addNativePhoto('camera')} className="inline-flex items-center gap-1 rounded-lg bg-violet-500/10 px-2 py-1.5 text-[9px] font-bold text-violet-200 disabled:opacity-40"><Camera className="h-3.5 w-3.5" />Cámara</button>
              <button disabled={busy || images.length >= 4} type="button" onClick={() => void addNativePhoto('photos')} className="inline-flex items-center gap-1 rounded-lg bg-white/[0.05] px-2 py-1.5 text-[9px] font-bold text-slate-300 disabled:opacity-40"><Images className="h-3.5 w-3.5" />Galería</button>
            </> : <button disabled={busy || images.length >= 4} type="button" onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-1 rounded-lg bg-violet-500/10 px-2 py-1.5 text-[9px] font-bold text-violet-200 disabled:opacity-40"><Images className="h-3.5 w-3.5" />Elegir fotos</button>}
          </div>
        </div>
        <div className="mt-2 grid grid-cols-4 gap-2">
          {images.map((image, index) => <div key={index} className="publish-photo relative"><img src={image} alt={`Foto ${index + 1}`} /><button type="button" onClick={() => setImages((current) => current.filter((_, i) => i !== index))}><X /></button></div>)}
          {images.length < 4 && <button type="button" onClick={() => nativeDevice ? void addNativePhoto('photos') : fileRef.current?.click()} className="publish-photo-add"><Plus /><small>Agregar</small></button>}
        </div>
        <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(event) => void addPhotos(event.target.files)} />
      </section>

      <section className="publish-card"><p className="eyebrow">REVISA LO ESENCIAL</p><label className="publish-label">Título</label><input className="publish-input" value={title} onChange={(e) => setTitle(e.target.value.slice(0, 120))} placeholder="¿Qué vendes?" /><label className="publish-label">Precio</label><input className="publish-input" type="number" min="0.01" step="0.01" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Precio en MXN" /><label className="publish-label">Categoría</label><select className="publish-input" value={category} onChange={(e) => { const next = e.target.value as ProductCategory; setCategory(next); setAttributes({}); if (next) setScope(defaultScopeForCategory(next)); }}><option value="">Selecciona</option>{MARKETPLACE_CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select><label className="publish-label">Descripción</label><textarea className="publish-textarea" rows={3} maxLength={3000} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Lo más importante del producto." /><p className="mt-1 text-right text-[8px] text-slate-600">{description.length.toLocaleString('es-MX')} / 3,000</p></section>

      {required.length > 0 && <section className="publish-card"><div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-300" /><strong className="text-xs">Datos necesarios para {category}</strong></div><p className="mt-1 text-[9px] text-slate-500">Sólo pedimos estos datos porque esta categoría necesita información adicional para publicarse con seguridad.</p><div className="mt-3 grid grid-cols-2 gap-2">{fields.filter((field) => field.required).map((field) => <label key={field.key} className="text-[9px] text-slate-500">{field.label} *{field.kind === 'boolean' ? <input className="ml-2" type="checkbox" checked={Boolean(attributes[field.key])} onChange={(e) => setAttributes((current) => ({ ...current, [field.key]: e.target.checked }))} /> : <input className="publish-input mt-1" type={field.kind === 'number' ? 'number' : 'text'} value={String(attributes[field.key] ?? '')} onChange={(e) => setAttributes((current) => ({ ...current, [field.key]: e.target.value.slice(0, 300) }))} placeholder={field.placeholder} />}</label>)}</div></section>}

      <button type="button" onClick={() => setAdvancedOpen((open) => !open)} className="flex w-full items-center justify-between rounded-2xl border border-white/[0.06] bg-white/[0.025] px-4 py-3 text-left"><span><strong className="block text-xs">Más opciones</strong><small className="mt-0.5 block text-[9px] text-slate-500">Condición, cantidad, alcance, entrega y datos opcionales.</small></span><ChevronDown className={`h-4 w-4 text-slate-500 transition-transform ${advancedOpen ? 'rotate-180' : ''}`} /></button>

      {advancedOpen && <>
        <section className="publish-card"><p className="eyebrow">DETALLES</p><div className="mt-2 grid grid-cols-2 gap-2"><select className="publish-input" value={condition} onChange={(e) => setCondition(e.target.value)}><option>Nuevo</option><option>Como nuevo</option><option>Buen estado</option><option>Uso visible</option><option>Para reparar</option><option>No aplica</option></select><input className="publish-input" type="number" min="1" max="99" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="Cantidad" /></div><label className="mt-2 flex items-center gap-2 text-xs"><input type="checkbox" checked={negotiable} onChange={(e) => setNegotiable(e.target.checked)} />Precio negociable</label>{fields.some((field) => !field.required) && <div className="mt-3 grid grid-cols-2 gap-2">{fields.filter((field) => !field.required).map((field) => <label key={field.key} className="text-[9px] text-slate-500">{field.label}{field.kind === 'boolean' ? <input className="ml-2" type="checkbox" checked={Boolean(attributes[field.key])} onChange={(e) => setAttributes((current) => ({ ...current, [field.key]: e.target.checked }))} /> : <input className="publish-input mt-1" type={field.kind === 'number' ? 'number' : 'text'} value={String(attributes[field.key] ?? '')} onChange={(e) => setAttributes((current) => ({ ...current, [field.key]: e.target.value.slice(0, 300) }))} placeholder={field.placeholder} />}</label>)}</div>}{category === 'Cuartos & Renta' && <p className="mt-2 text-[9px] text-amber-200/70">Nunca publiques la dirección exacta; sólo zona aproximada.</p>}</section>

        <section className="publish-card"><p className="eyebrow">ALCANCE Y ENTREGA</p><div className="mt-2 grid gap-2">{VISIBILITY_SCOPES.map((item) => <button key={item.id} type="button" onClick={() => selectScope(item.id)} className={`rounded-xl p-3 text-left ${scope === item.id ? 'bg-violet-500/10 ring-1 ring-violet-400/20' : 'bg-white/[0.02]'}`}><strong className="text-[10px]">{item.label}</strong><p className="text-[9px] text-slate-600">{item.hint}</p></button>)}</div><div className="mt-3 flex flex-wrap gap-2">{DELIVERY.map((item) => <button key={item.id} type="button" onClick={() => toggleDelivery(item.id)} className={`filter-chip ${deliveryMethods.includes(item.id) ? 'filter-chip-active' : ''}`}>{item.label}</button>)}</div><p className="mt-2 rounded-xl bg-sky-500/[0.05] px-3 py-2 text-[9px] text-sky-200/80"><strong>TuTop no hace envíos.</strong> Si vendedor y comprador acuerdan mensajería o paquetería, se coordina directamente entre ellos. El alcance nacional no obliga a usarla.</p>{safePoints.length > 0 && <select className="publish-input mt-3" value={meetingPointId} onChange={(e) => setMeetingPointId(e.target.value)}><option value="">Punto a coordinar</option>{safePoints.map((point) => <option key={point.id} value={point.id}>{point.name}</option>)}</select>}</section>
      </>}

      {category && <section className="publish-card"><div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-violet-300" /><strong className="text-xs">Precio inteligente</strong></div>{pricing ? <><p className="mt-2 text-[10px] leading-5 text-slate-400">{pricing.sample_size} comparables · mediana ${pricing.median_mxn.toLocaleString('es-MX')} · vender rápido ${pricing.sell_fast_mxn.toLocaleString('es-MX')} · recomendado <strong className="text-violet-200">${pricing.recommended_mxn.toLocaleString('es-MX')}</strong> · probar alto ${pricing.try_high_mxn.toLocaleString('es-MX')}</p><button type="button" onClick={() => setPrice(String(pricing.recommended_mxn))} className="mt-2 rounded-xl bg-violet-500/10 px-3 py-2 text-[10px] font-bold text-violet-200">Usar precio recomendado</button></> : <p className="mt-2 text-[9px] text-slate-500">Aún no hay suficientes comparables reales. Topi no inventará un precio.</p>}</section>}

      <section className={`publish-card ${readyToPublish ? 'border-emerald-400/20 bg-emerald-500/[0.05]' : 'border-amber-400/15 bg-amber-500/[0.04]'}`}><div className="flex items-center gap-2"><CheckCircle2 className={`h-4 w-4 ${readyToPublish ? 'text-emerald-300' : 'text-amber-300'}`} /><strong className="text-xs">{readyToPublish ? 'Listo para publicar' : 'Completa lo mínimo'}</strong></div><p className="mt-1 text-[9px] text-slate-400">{readyToPublish ? 'Tu anuncio tiene lo necesario. Los campos avanzados siguen siendo opcionales salvo los marcados con *.' : `Falta: ${publishIssues.join(' · ')}`}</p></section>
      {message && <div className="rounded-2xl bg-white/[0.04] p-3 text-xs text-slate-300">{message}</div>}
      <button disabled={busy || !readyToPublish} onClick={() => void publish()} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-fuchsia-600 py-4 text-sm font-black disabled:opacity-40">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}{busy ? 'Publicando…' : readyToPublish ? 'Publicar en TuTop' : 'Completa lo mínimo para publicar'}</button>
    </main>
  </div>;
}
