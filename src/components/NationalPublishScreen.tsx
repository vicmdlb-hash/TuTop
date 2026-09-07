import { useMemo, useRef, useState } from 'react';
import { ArrowLeft, CheckCircle2, ChevronDown, Loader2, Plus, ShieldCheck, Sparkles, WandSparkles, X } from 'lucide-react';
import { compressImageForFirestore } from '../lib/imageCompression';
import { categorySafetyRequirements } from '../lib/marketplaceGovernance';
import { nationalFieldsFor, normalizeNationalAttributes } from '../lib/nationalListingFields';
import type { CanonicalListingV2, ListingDeliveryMethod } from '../lib/listingSchemaV2';
import { smartPriceFromTuTop } from '../lib/smartPricing';
import { cleanTitle, detectCategory, extractPrice, improveDescription, isForbiddenProductText, MARKETPLACE_CATEGORIES } from '../lib/productAssistant';
import { detectDeliveryIntent, detectListingCondition, detectNegotiableIntent, detectVisibilityIntent } from '../lib/publishAssistant';
import { defaultScopeForCategory, identityFor, safeMeetingPointsFor, VISIBILITY_SCOPES } from '../lib/universityNetwork';
import { canonicalListingsBackend } from '../services/canonicalListingsBackend';
import { nationalBackend } from '../services/nationalBackend';
import { useAppStore } from '../store/useAppStore';
import type { ListingVisibilityScope, Product, ProductCategory } from '../types';

const FALLBACK_IMAGE = `data:image/svg+xml;charset=utf-8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600"><rect width="900" height="600" fill="#111827"/><text x="450" y="310" text-anchor="middle" fill="#c4b5fd" font-size="42" font-family="Arial">TuTop</text></svg>')}`;
const DELIVERY: Array<{ id: ListingDeliveryMethod; label: string }> = [
  { id: 'campus_meetup', label: 'Encuentro en campus' },
  { id: 'pickup', label: 'Recoger' },
  { id: 'local_delivery', label: 'Entrega local' },
  { id: 'shipping', label: 'Paquetería' },
];
function slug(value: string) { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }

export default function NationalPublishScreen() {
  const user = useAppStore((state) => state.user);
  const products = useAppStore((state) => state.products);
  const setActiveTab = useAppStore((state) => state.setActiveTab);
  const fileRef = useRef<HTMLInputElement>(null);
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
  const [attributes, setAttributes] = useState<Record<string, string | boolean>>({});
  const [images, setImages] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

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
  const publishIssues: string[] = [];
  if (!institutionId || !campusId) publishIssues.push('universidad/campus');
  if (!title.trim()) publishIssues.push('título');
  if (!category) publishIssues.push('categoría');
  if (!hasValidPrice) publishIssues.push('precio mayor a $0');
  if (!deliveryMethods.length) publishIssues.push('forma de entrega');
  if (missing.length) publishIssues.push(`${missing.length} dato${missing.length === 1 ? '' : 's'} obligatorio${missing.length === 1 ? '' : 's'}`);
  if (scope === 'national' && !shippingAvailable) publishIssues.push('paquetería para Todo México');
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

  const applyTopi = () => {
    const text = assistantText.trim();
    if (text.length < 3) return setMessage('Cuéntale a Topi qué quieres vender en una frase.');
    if (isForbiddenProductText(text)) return setMessage('Ese tipo de artículo o servicio no está permitido en TuTop. No se creó ningún borrador.');

    const inferredCategory = category || detectCategory(text) || '';
    const extractedPrice = extractPrice(text);
    const inferredPrice = price || (extractedPrice && extractedPrice > 0 ? String(extractedPrice) : '');
    const inferredTitle = title || cleanTitle(text) || text.slice(0, 90);
    const inferredCondition = detectListingCondition(text);
    const inferredNegotiable = detectNegotiableIntent(text);
    const explicitScope = detectVisibilityIntent(text);
    const inferredScope = explicitScope || (inferredCategory ? defaultScopeForCategory(inferredCategory) : scope);
    const inferredDelivery = detectDeliveryIntent(text);

    if (inferredCategory && inferredCategory !== category) {
      setCategory(inferredCategory);
      setAttributes({});
    }
    setTitle(inferredTitle);
    if (inferredPrice) setPrice(inferredPrice);
    if (inferredCondition) setCondition(inferredCondition);
    if (inferredNegotiable !== undefined) setNegotiable(inferredNegotiable);
    setScope(inferredScope);
    if (inferredDelivery.length) setDeliveryMethods(inferredDelivery);
    else if (inferredScope === 'national') setDeliveryMethods(['shipping']);
    if (!description.trim()) {
      const generated = text.length > inferredTitle.length + 8
        ? text.slice(0, 900)
        : improveDescription({ titulo: inferredTitle, categoria: inferredCategory || undefined, descripcion: '' });
      setDescription(generated);
    }
    setMessage(inferredPrice
      ? 'Topi preparó título, categoría, precio y detalles de entrega. Revisa y publica.'
      : 'Topi preparó el anuncio y la entrega. Sólo falta que confirmes un precio mayor a $0.');
  };

  const addPhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true); setMessage(null);
    try {
      const next: string[] = [];
      for (const file of Array.from(files).slice(0, Math.max(0, 4 - images.length))) next.push(await compressImageForFirestore(file, { maxDimension: 960, maxBytes: 82_000 }));
      setImages((current) => [...current, ...next].slice(0, 4));
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No pudimos procesar las fotos.'); }
    finally { setBusy(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  const toggleDelivery = (method: ListingDeliveryMethod) => {
    setDeliveryMethods((current) => current.includes(method) ? current.filter((item) => item !== method) : [...current, method]);
  };

  const selectScope = (nextScope: ListingVisibilityScope) => {
    setScope(nextScope);
    if (nextScope === 'national') setDeliveryMethods((current) => current.includes('shipping') ? current : [...current, 'shipping']);
  };

  const publish = async () => {
    setMessage(null);
    if (!institutionId || !campusId) return setMessage('Primero selecciona tu universidad y campus.');
    if (!title.trim() || !category || !hasValidPrice) return setMessage('Completa título, categoría y un precio mayor a $0.');
    if (!deliveryMethods.length) return setMessage('Selecciona al menos una forma de entrega.');
    if (missing.length) {
      setAdvancedOpen(true);
      return setMessage(`Faltan datos obligatorios: ${missing.join(', ')}.`);
    }
    if (scope === 'national' && !shippingAvailable) return setMessage('Todo México requiere seleccionar Paquetería.');
    setBusy(true);
    try {
      const identity = identityFor(
        institutionId,
        campusId,
        user.faculty_id || user.university?.faculty_id,
        user.career_id || user.university?.career_id,
      );
      await nationalBackend.updateUniversityIdentity(identity, user.facultad);

      const now = new Date().toISOString();
      const listing: CanonicalListingV2 = {
        schema_version: 2, seller_id: user.id, institution_id: institutionId, campus_id: campusId, city_id: cityId,
        faculty_id: user.faculty_id || user.university?.faculty_id, career_id: user.career_id || user.university?.career_id,
        category_id: slug(category), title: title.trim().slice(0, 120), description: description.trim().slice(0, 3000),
        attributes: normalizedAttributes, price_mxn: Math.round(parsedPrice * 100) / 100, negotiable,
        quantity: Math.max(1, Math.min(99, Number(quantity) || 1)), condition, delivery_methods: deliveryMethods,
        meeting_point_ids: meetingPointId ? [meetingPointId] : [], shipping_available: shippingAvailable,
        photo_urls: images.length ? images : [FALLBACK_IMAGE], status: 'active', moderation_status: 'pending', visibility_scope: scope,
        published_at: now, created_at: now, updated_at: now,
      };
      await canonicalListingsBackend.create(listing, category);
      const refreshed = await canonicalListingsBackend.loadMarketplaceProducts({ campusId, institutionId, cityId, limitPerScope: 30 });
      useAppStore.setState({ products: refreshed });
      setMessage('Publicación creada y enviada a revisión.');
      window.setTimeout(() => setActiveTab('feed'), 700);
    } catch (error) {
      const raw = error instanceof Error ? error.message : String(error);
      if (/Missing or insufficient permissions|PERMISSION_DENIED/i.test(raw)) {
        setMessage('No pudimos validar los permisos de tu cuenta para publicar. Tu universidad/campus se intentaron resincronizar; vuelve a intentarlo o reinicia sesión si persiste.');
      } else {
        setMessage(raw.startsWith('PROHIBITED_LISTING:') ? 'Ese artículo no está permitido en TuTop.' : raw.startsWith('PRIVATE_FIELD_EXPOSED:') ? 'Hay un dato privado que no debe publicarse.' : `No pudimos publicar: ${raw}`);
      }
    } finally { setBusy(false); }
  };

  return <div className="publish-screen pb-[calc(82px+env(safe-area-inset-bottom))]">
    <header className="publish-header pt-safe"><button onClick={() => setActiveTab('feed')} className="icon-button-lg"><ArrowLeft className="h-5 w-5" /></button><div><h1 className="text-lg font-black">Publica fácil con Topi</h1><p className="text-[10px] text-slate-500">Describe lo que vendes; TuTop prepara el borrador.</p></div></header>
    <main className="page-pad space-y-3 pt-3">
      <section className="publish-card border-violet-400/15 bg-violet-500/[0.05]"><div className="flex items-center gap-2"><WandSparkles className="h-4 w-4 text-violet-300" /><div><strong className="text-xs">Topi te ayuda a publicar</strong><p className="mt-0.5 text-[9px] text-slate-500">Escribe una sola frase. Topi puede reconocer producto, precio, estado, entrega y alcance.</p></div></div><textarea className="publish-textarea mt-3" rows={3} value={assistantText} onChange={(e) => setAssistantText(e.target.value.slice(0, 700))} placeholder="Ej. Vendo audífonos Sony como nuevos, $2,500 negociables, entrego en Campus Ribereña." /><button type="button" onClick={applyTopi} className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 py-3 text-xs font-black text-white"><Sparkles className="h-4 w-4" />Topi, prepara mi anuncio</button></section>

      <section className="publish-card"><strong className="text-xs">{user.university?.institution_name || institutionId || 'Elige tu universidad'}</strong><p className="mt-1 text-[9px] text-slate-500">{user.university?.campus_name || campusId || 'Falta campus'}{user.university?.career_name ? ` · ${user.university.career_name}` : ''}</p></section>

      <section className="publish-card"><p className="eyebrow">FOTOS</p><div className="mt-2 grid grid-cols-4 gap-2">{images.map((image, index) => <div key={index} className="publish-photo relative"><img src={image} alt={`Foto ${index + 1}`} /><button onClick={() => setImages((current) => current.filter((_, i) => i !== index))}><X /></button></div>)}{images.length < 4 && <button onClick={() => fileRef.current?.click()} className="publish-photo-add"><Plus /><small>Agregar</small></button>}</div><input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(event) => void addPhotos(event.target.files)} /></section>

      <section className="publish-card"><p className="eyebrow">REVISA LO ESENCIAL</p><label className="publish-label">Título</label><input className="publish-input" value={title} onChange={(e) => setTitle(e.target.value.slice(0, 120))} placeholder="¿Qué vendes?" /><label className="publish-label">Precio</label><input className="publish-input" type="number" min="0.01" step="0.01" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Precio en MXN" /><label className="publish-label">Categoría</label><select className="publish-input" value={category} onChange={(e) => { const next = e.target.value as ProductCategory; setCategory(next); setAttributes({}); if (next) setScope(defaultScopeForCategory(next)); }}><option value="">Selecciona</option>{MARKETPLACE_CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select><label className="publish-label">Descripción</label><textarea className="publish-textarea" rows={3} maxLength={3000} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Lo más importante del producto." /><p className="mt-1 text-right text-[8px] text-slate-600">{description.length.toLocaleString('es-MX')} / 3,000</p></section>

      {required.length > 0 && <section className="publish-card"><div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-300" /><strong className="text-xs">Datos necesarios para {category}</strong></div><p className="mt-1 text-[9px] text-slate-500">Sólo pedimos estos datos porque esta categoría necesita información adicional para publicarse con seguridad.</p><div className="mt-3 grid grid-cols-2 gap-2">{fields.filter((field) => field.required).map((field) => <label key={field.key} className="text-[9px] text-slate-500">{field.label} *{field.kind === 'boolean' ? <input className="ml-2" type="checkbox" checked={Boolean(attributes[field.key])} onChange={(e) => setAttributes((current) => ({ ...current, [field.key]: e.target.checked }))} /> : <input className="publish-input mt-1" type={field.kind === 'number' ? 'number' : 'text'} value={String(attributes[field.key] ?? '')} onChange={(e) => setAttributes((current) => ({ ...current, [field.key]: e.target.value.slice(0, 300) }))} placeholder={field.placeholder} />}</label>)}</div></section>}

      <button type="button" onClick={() => setAdvancedOpen((open) => !open)} className="flex w-full items-center justify-between rounded-2xl border border-white/[0.06] bg-white/[0.025] px-4 py-3 text-left"><span><strong className="block text-xs">Más opciones</strong><small className="mt-0.5 block text-[9px] text-slate-500">Condición, cantidad, alcance, entrega y datos opcionales.</small></span><ChevronDown className={`h-4 w-4 text-slate-500 transition-transform ${advancedOpen ? 'rotate-180' : ''}`} /></button>

      {advancedOpen && <>
        <section className="publish-card"><p className="eyebrow">DETALLES</p><div className="mt-2 grid grid-cols-2 gap-2"><select className="publish-input" value={condition} onChange={(e) => setCondition(e.target.value)}><option>Nuevo</option><option>Como nuevo</option><option>Buen estado</option><option>Uso visible</option><option>Para reparar</option><option>No aplica</option></select><input className="publish-input" type="number" min="1" max="99" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="Cantidad" /></div><label className="mt-2 flex items-center gap-2 text-xs"><input type="checkbox" checked={negotiable} onChange={(e) => setNegotiable(e.target.checked)} />Precio negociable</label>{fields.some((field) => !field.required) && <div className="mt-3 grid grid-cols-2 gap-2">{fields.filter((field) => !field.required).map((field) => <label key={field.key} className="text-[9px] text-slate-500">{field.label}{field.kind === 'boolean' ? <input className="ml-2" type="checkbox" checked={Boolean(attributes[field.key])} onChange={(e) => setAttributes((current) => ({ ...current, [field.key]: e.target.checked }))} /> : <input className="publish-input mt-1" type={field.kind === 'number' ? 'number' : 'text'} value={String(attributes[field.key] ?? '')} onChange={(e) => setAttributes((current) => ({ ...current, [field.key]: e.target.value.slice(0, 300) }))} placeholder={field.placeholder} />}</label>)}</div>}{category === 'Cuartos & Renta' && <p className="mt-2 text-[9px] text-amber-200/70">Nunca publiques la dirección exacta; sólo zona aproximada.</p>}</section>

        <section className="publish-card"><p className="eyebrow">ALCANCE Y ENTREGA</p><div className="mt-2 grid gap-2">{VISIBILITY_SCOPES.map((item) => <button key={item.id} type="button" onClick={() => selectScope(item.id)} className={`rounded-xl p-3 text-left ${scope === item.id ? 'bg-violet-500/10 ring-1 ring-violet-400/20' : 'bg-white/[0.02]'}`}><strong className="text-[10px]">{item.label}</strong><p className="text-[9px] text-slate-600">{item.hint}</p></button>)}</div><div className="mt-3 flex flex-wrap gap-2">{DELIVERY.map((item) => <button key={item.id} type="button" onClick={() => toggleDelivery(item.id)} className={`filter-chip ${deliveryMethods.includes(item.id) ? 'filter-chip-active' : ''}`}>{item.label}</button>)}</div>{scope === 'national' && <p className="mt-2 rounded-xl bg-sky-500/[0.05] px-3 py-2 text-[9px] text-sky-200/80">Todo México activa <strong>Paquetería</strong> automáticamente; puedes añadir otras formas de entrega si también aplican.</p>}{safePoints.length > 0 && <select className="publish-input mt-3" value={meetingPointId} onChange={(e) => setMeetingPointId(e.target.value)}><option value="">Punto a coordinar</option>{safePoints.map((point) => <option key={point.id} value={point.id}>{point.name}</option>)}</select>}</section>
      </>}

      {category && <section className="publish-card"><div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-violet-300" /><strong className="text-xs">Precio inteligente</strong></div>{pricing ? <><p className="mt-2 text-[10px] leading-5 text-slate-400">{pricing.sample_size} comparables · mediana ${pricing.median_mxn.toLocaleString('es-MX')} · vender rápido ${pricing.sell_fast_mxn.toLocaleString('es-MX')} · recomendado <strong className="text-violet-200">${pricing.recommended_mxn.toLocaleString('es-MX')}</strong> · probar alto ${pricing.try_high_mxn.toLocaleString('es-MX')}</p><button type="button" onClick={() => setPrice(String(pricing.recommended_mxn))} className="mt-2 rounded-xl bg-violet-500/10 px-3 py-2 text-[10px] font-bold text-violet-200">Usar precio recomendado</button></> : <p className="mt-2 text-[9px] text-slate-500">Aún no hay suficientes comparables reales. Topi no inventará un precio.</p>}</section>}

      <section className={`publish-card ${readyToPublish ? 'border-emerald-400/20 bg-emerald-500/[0.05]' : 'border-amber-400/15 bg-amber-500/[0.04]'}`}><div className="flex items-center gap-2"><CheckCircle2 className={`h-4 w-4 ${readyToPublish ? 'text-emerald-300' : 'text-amber-300'}`} /><strong className="text-xs">{readyToPublish ? 'Listo para publicar' : 'Completa lo mínimo'}</strong></div><p className="mt-1 text-[9px] text-slate-400">{readyToPublish ? 'Tu anuncio tiene lo necesario. Los campos avanzados siguen siendo opcionales salvo los marcados con *.' : `Falta: ${publishIssues.join(' · ')}`}</p></section>
      {message && <div className="rounded-2xl bg-white/[0.04] p-3 text-xs text-slate-300">{message}</div>}
      <button disabled={busy || !readyToPublish} onClick={() => void publish()} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-fuchsia-600 py-4 text-sm font-black disabled:opacity-40">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}{busy ? 'Publicando…' : readyToPublish ? 'Publicar en TuTop' : 'Completa lo mínimo para publicar'}</button>
    </main>
  </div>;
}
