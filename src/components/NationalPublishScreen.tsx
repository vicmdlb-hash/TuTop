import { useMemo, useRef, useState } from 'react';
import { ArrowLeft, Camera, CheckCircle2, Loader2, MapPin, Plus, ShieldCheck, Sparkles, X } from 'lucide-react';
import { compressImageForFirestore } from '../lib/imageCompression';
import { categorySafetyRequirements } from '../lib/marketplaceGovernance';
import { nationalFieldsFor, normalizeNationalAttributes } from '../lib/nationalListingFields';
import type { CanonicalListingV2, ListingDeliveryMethod } from '../lib/listingSchemaV2';
import { smartPriceFromTuTop } from '../lib/smartPricing';
import { MARKETPLACE_CATEGORIES } from '../lib/productAssistant';
import { safeMeetingPointsFor, VISIBILITY_SCOPES } from '../lib/universityNetwork';
import { canonicalListingsBackend } from '../services/canonicalListingsBackend';
import { useAppStore } from '../store/useAppStore';
import type { ListingVisibilityScope, Product, ProductCategory } from '../types';

const FALLBACK_IMAGE = `data:image/svg+xml;charset=utf-8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600"><rect width="900" height="600" fill="#111827"/><text x="450" y="310" text-anchor="middle" fill="#c4b5fd" font-size="42" font-family="Arial">TuTop</text></svg>')}`;

const DELIVERY: Array<{ id: ListingDeliveryMethod; label: string }> = [
  { id: 'campus_meetup', label: 'Encuentro en campus' },
  { id: 'pickup', label: 'Recoger' },
  { id: 'local_delivery', label: 'Entrega local' },
  { id: 'shipping', label: 'Paquetería' },
];

function slug(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export default function NationalPublishScreen() {
  const user = useAppStore((state) => state.user);
  const products = useAppStore((state) => state.products);
  const setActiveTab = useAppStore((state) => state.setActiveTab);
  const fileRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [category, setCategory] = useState<ProductCategory | ''>('');
  const [condition, setCondition] = useState('Buen estado');
  const [negotiable, setNegotiable] = useState(false);
  const [scope, setScope] = useState<ListingVisibilityScope>('campus');
  const [shipping, setShipping] = useState(false);
  const [deliveryMethods, setDeliveryMethods] = useState<ListingDeliveryMethod[]>(['campus_meetup']);
  const [meetingPointId, setMeetingPointId] = useState('');
  const [attributes, setAttributes] = useState<Record<string, string | boolean>>({});
  const [images, setImages] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const institutionId = user.institution_id || user.university?.institution_id || '';
  const campusId = user.campus_id || user.university?.campus_id || '';
  const cityId = user.university?.city_id;
  const fields = useMemo(() => nationalFieldsFor(category || undefined), [category]);
  const safePoints = useMemo(() => safeMeetingPointsFor(campusId, institutionId), [campusId, institutionId]);
  const normalizedAttributes = useMemo(() => normalizeNationalAttributes(fields, attributes), [fields, attributes]);
  const requiredPolicy = useMemo(() => categorySafetyRequirements(category || undefined), [category]);
  const missingRequired = requiredPolicy.required.filter((key) => {
    const value = normalizedAttributes[key];
    return value === undefined || value === null || value === '';
  });

  const pricingTarget = useMemo<Product | null>(() => {
    if (!category) return null;
    return {
      id: 'pricing-draft', vendedor_id: user.id, vendedor_nombre: user.nombre, titulo: title || category,
      descripcion: description, precio_mxn: Number(price || 0), categoria, facultad: user.facultad,
      marca: typeof normalizedAttributes.brand === 'string' ? normalizedAttributes.brand : undefined,
      modelo: typeof normalizedAttributes.model === 'string' ? normalizedAttributes.model : undefined,
      attributes: normalizedAttributes, institution_id: institutionId || undefined, campus_id: campusId || undefined,
      city_id: cityId, visibility_scope: scope, punto_encuentro: 'Coordinar por Chat', imagen_url: FALLBACK_IMAGE,
      estado: 'Activo', es_top: false, jerarquia_top: 0, likes: 0, fecha_creacion: new Date().toISOString(),
    };
  }, [category, user.id, user.nombre, user.facultad, title, description, price, normalizedAttributes, institutionId, campusId, cityId, scope]);
  const pricing = useMemo(() => pricingTarget ? smartPriceFromTuTop(pricingTarget, products) : null, [pricingTarget, products]);

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true); setError(null);
    try {
      const selected = Array.from(files).slice(0, Math.max(0, 4 - images.length));
      const compressed: string[] = [];
      for (const file of selected) compressed.push(await compressImageForFirestore(file, { maxDimension: 960, maxBytes: 82_000 }));
      setImages((current) => [...current, ...compressed].slice(0, 4));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos procesar las fotos.');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const toggleDelivery = (method: ListingDeliveryMethod) => {
    setDeliveryMethods((current) => current.includes(method) ? current.filter((item) => item !== method) : [...current, method]);
    if (method === 'shipping') setShipping((value) => !deliveryMethods.includes('shipping') ? true : value);
  };

  const publish = async () => {
    setError(null); setNotice(null);
    if (!institutionId || !campusId) { setError('Primero selecciona tu universidad y campus en TuTop.'); return; }
    if (!title.trim() || !category || !Number(price) || Number(price) < 0) { setError('Completa título, categoría y precio.'); return; }
    if (!deliveryMethods.length) { setError('Selecciona al menos una forma de entrega.'); return; }
    if (missingRequired.length) { setError(`Faltan datos obligatorios de esta categoría: ${missingRequired.join(', ')}.`); return; }
    if (scope === 'national' && !shipping) { setError('Todo México requiere envío disponible.'); return; }
    setBusy(true);
    try {
      const now = new Date().toISOString();
      const listing: CanonicalListingV2 = {
        schema_version: 2,
        seller_id: user.id,
        institution_id: institutionId,
        campus_id: campusId,
        city_id: cityId,
        faculty_id: user.faculty_id || user.university?.faculty_id,
        career_id: user.career_id || user.university?.career_id,
        category_id: slug(category),
        title: title.trim().slice(0, 120),
        description: description.trim().slice(0, 3000),
        attributes: normalizedAttributes,
        price_mxn: Math.round(Number(price) * 100) / 100,
        negotiable,
        quantity: Math.max(1, Math.min(99, Number(quantity) || 1)),
        condition,
        delivery_methods: deliveryMethods,
        meeting_point_ids: meetingPointId ? [meetingPointId] : [],
        shipping_available: shipping,
        photo_urls: images.length ? images : [FALLBACK_IMAGE],
        status: 'active',
        moderation_status: 'pending',
        visibility_scope: scope,
        published_at: now,
        created_at: now,
        updated_at: now,
      };
      await canonicalListingsBackend.create(listing, category);
      const refreshed = await canonicalListingsBackend.loadMarketplaceProducts({ campusId, institutionId, cityId, limitPerScope: 30 });
      useAppStore.setState({ products: refreshed });
      setNotice('Publicación creada en listings_v2. Queda en revisión antes de mostrarse a otras personas.');
      window.setTimeout(() => setActiveTab('feed'), 800);
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      if (raw.startsWith('PROHIBITED_LISTING:')) setError('Ese artículo no está permitido por las normas de TuTop.');
      else if (raw.startsWith('RESTRICTED_FLOW_MISSING:')) setError('Completa los datos obligatorios de seguridad para esta categoría.');
      else if (raw.startsWith('PRIVATE_FIELD_EXPOSED:')) setError('Quitamos campos que no deben publicarse, como una dirección exacta.');
      else setError(`No pudimos publicar: ${raw}`);
    } finally { setBusy(false); }
  };

  return (
    <div className="publish-screen pb-[calc(82px+env(safe-area-inset-bottom))]">
      <header className="publish-header pt-safe"><button onClick={() => setActiveTab('feed')} className="icon-button-lg" aria-label="Volver"><ArrowLeft className="h-5 w-5" /></button><div className="min-w-0 flex-1"><h1 className="text-[18px] font-black">Publicar en la red TuTop</h1><p className="mt-0.5 text-[10px] text-slate-500">V2 · institución → campus → categoría → alcance</p></div><span className="rounded-full bg-violet-500/10 px-2 py-1 text-[9px] font-black text-violet-300">0.8.5</span></header>
      <main className="page-pad pt-3 space-y-3">
        {!institutionId || !campusId ? <section className="publish-card border-amber-400/20"><strong className="text-amber-200">Falta tu red universitaria</strong><p className="mt-1 text-[10px] text-slate-500">Selecciona institución y campus antes de publicar. Ya no usamos “facultad” como ubicación principal.</p></section> : <section className="publish-card"><div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-violet-300"/><div><strong className="text-xs">{user.university?.institution_name || institutionId}</strong><p className="text-[9px] text-slate-500">{user.university?.campus_name || campusId}{user.university?.career_name ? ` · ${user.university.career_name}` : ''}</p></div></div></section>}

        <section className="publish-card"><p className="eyebrow">FOTOS</p><div className="mt-2 grid grid-cols-4 gap-2">{images.map((image, index) => <div key={index} className="publish-photo relative"><img src={image} alt={`Foto ${index + 1}`} /><button onClick={() => setImages((current) => current.filter((_, i) => i !== index))}><X /></button>{index === 0 && <span>PORTADA</span>}</div>)}{images.length < 4 && <button onClick={() => fileRef.current?.click()} className="publish-photo-add"><Plus/><small>Agregar</small></button>}</div><input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => void handleFiles(e.target.files)} /><p className="mt-2 flex items-center gap-1 text-[9px] text-slate-600"><Camera className="h-3 w-3"/>Compresión automática para la beta Firestore.</p></section>

        <section className="publish-card"><p className="eyebrow">LO ESENCIAL</p><label className="publish-label">Título</label><input className="publish-input" value={title} onChange={(e) => setTitle(e.target.value.slice(0,120))} placeholder="Ej. iPhone 13 128 GB"/><div className="mt-2 grid grid-cols-2 gap-2"><div><label className="publish-label mt-0">Precio</label><input className="publish-input" type="number" inputMode="decimal" value={price} onChange={(e)=>setPrice(e.target.value)} placeholder="0"/></div><div><label className="publish-label mt-0">Cantidad</label><input className="publish-input" type="number" min="1" max="99" value={quantity} onChange={(e)=>setQuantity(e.target.value)}/></div></div><label className="publish-label">Categoría</label><select className="publish-input" value={category} onChange={(e)=>{setCategory(e.target.value as ProductCategory);setAttributes({});}}><option value="">Selecciona</option>{MARKETPLACE_CATEGORIES.map((item)=><option key={item}>{item}</option>)}</select><label className="publish-label">Descripción</label><textarea className="publish-textarea" rows={4} maxLength={3000} value={description} onChange={(e)=>setDescription(e.target.value)} placeholder="Sólo describe el producto. Los detalles estructurados van abajo."/><label className="publish-label">Estado</label><select className="publish-input" value={condition} onChange={(e)=>setCondition(e.target.value)}><option>Nuevo</option><option>Como nuevo</option><option>Buen estado</option><option>Uso visible</option><option>Para reparar</option><option>No aplica</option></select><label className="mt-3 flex items-center justify-between rounded-xl bg-white/[0.03] p-3 text-xs"><span>Precio negociable</span><input type="checkbox" checked={negotiable} onChange={(e)=>setNegotiable(e.target.checked)}/></label></section>

        {fields.length > 0 && <section className="publish-card"><div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-300"/><div><p className="eyebrow">DATOS DE {category}</p><p className="text-[9px] text-slate-500">Los obligatorios dependen del riesgo y utilidad de la categoría.</p></div></div><div className="mt-3 grid grid-cols-2 gap-2">{fields.map((field)=><div key={field.key} className={field.key === 'included_services' || field.key === 'ingredients' ? 'col-span-2' : ''}><label className="mb-1 block text-[9px] font-bold text-slate-500">{field.label}{field.required ? ' *' : ''}</label>{field.kind === 'boolean' ? <label className="flex h-11 items-center gap-2 rounded-xl bg-white/[0.03] px-3 text-xs"><input type="checkbox" checked={Boolean(attributes[field.key])} onChange={(e)=>setAttributes((current)=>({...current,[field.key]:e.target.checked}))}/>Sí</label> : <input className="publish-input" type={field.kind === 'number' ? 'number' : 'text'} value={String(attributes[field.key] ?? '')} onChange={(e)=>setAttributes((current)=>({...current,[field.key]:e.target.value.slice(0,300)}))} placeholder={field.placeholder}/>}</div>)}</div>{category === 'Cuartos & Renta' && <p className="mt-2 rounded-xl bg-amber-500/5 p-2 text-[9px] text-amber-200/70">No solicitamos ni publicamos la dirección exacta. Sólo zona aproximada y distancia al campus.</p>}{category === 'Transporte' && <p className="mt-2 rounded-xl bg-sky-500/5 p-2 text-[9px] text-sky-200/70">Este flujo es para compartir viaje/gastos; TuTop no opera como servicio de transporte.</p>}</section>}

        <section className="publish-card"><p className="eyebrow">ALCANCE Y ENTREGA</p><div className="mt-2 grid gap-2">{VISIBILITY_SCOPES.map((item)=><button key={item.id} onClick={()=>setScope(item.id)} className={`rounded-xl border p-3 text-left ${scope===item.id?'border-violet-400/25 bg-violet-500/10':'border-white/5 bg-white/[0.02]'}`}><strong className="text-[10px]">{item.label}</strong><p className="mt-1 text-[9px] text-slate-600">{item.hint}</p></button>)}</div><div className="mt-3 flex flex-wrap gap-2">{DELIVERY.map((item)=><button key={item.id} onClick={()=>toggleDelivery(item.id)} className={`filter-chip ${deliveryMethods.includes(item.id)?'filter-chip-active':''}`}>{item.label}</button>)}</div>{scope==='national' && <label className="mt-3 flex items-center justify-between rounded-xl bg-amber-500/[0.05] p-3 text-xs"><span>Disponible para envío</span><input type="checkbox" checked={shipping} onChange={(e)=>{setShipping(e.target.checked);if(e.target.checked&&!deliveryMethods.includes('shipping'))setDeliveryMethods((d)=>[...d,'shipping']);}}/></label>}{safePoints.length>0 && <><label className="publish-label">Punto TuTop sugerido</label><select className="publish-input" value={meetingPointId} onChange={(e)=>setMeetingPointId(e.target.value)}><option value="">Coordinar después</option>{safePoints.map((point)=><option key={point.id} value={point.id}>{point.name}</option>)}</select></>}</section>

        {category && <section className="publish-card"><div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-violet-300"/><strong className="text-xs">Precio inteligente con datos de TuTop</strong></div>{pricing ? <div className="mt-3 grid grid-cols-3 gap-2 text-center"><div className="rounded-xl bg-white/[0.03] p-2"><span className="block text-[8px] text-slate-500">Vender rápido</span><strong className="text-sm">${pricing.sell_fast_mxn.toLocaleString('es-MX')}</strong></div><div className="rounded-xl bg-violet-500/10 p-2"><span className="block text-[8px] text-violet-300">Recomendado</span><strong className="text-sm">${pricing.recommended_mxn.toLocaleString('es-MX')}</strong></div><div className="rounded-xl bg-white/[0.03] p-2"><span className="block text-[8px] text-slate-500">Probar alto</span><strong className="text-sm">${pricing.try_high_mxn.toLocaleString('es-MX')}</strong></div><p className="col-span-3 text-[9px] text-slate-600">{pricing.sample_size} comparables reales · mediana ${pricing.median_mxn.toLocaleString('es-MX')} · alcance {pricing.scope}</p></div> : <p className="mt-2 text-[9px] leading-4 text-slate-500">Todavía no hay suficientes comparables reales. Topi no inventará un precio.</p>}</section>}

        {error && <div className="rounded-2xl border border-rose-400/15 bg-rose-500/10 p-3 text-xs text-rose-200">{error}</div>}{notice && <div className="rounded-2xl border border-emerald-400/15 bg-emerald-500/10 p-3 text-xs text-emerald-200"><CheckCircle2 className="mr-1 inline h-4 w-4"/>{notice}</div>}
        <button disabled={busy || !institutionId || !campusId} onClick={()=>void publish()} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-fuchsia-600 py-4 text-sm font-black disabled:opacity-40">{busy?<Loader2 className="h-4 w-4 animate-spin"/>:<CheckCircle2 className="h-4 w-4"/>}Publicar en TuTop V2</button>
      </main>
    </div>
  );
}
