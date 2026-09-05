import { useMemo, useRef, useState } from 'react';
import { ArrowLeft, CheckCircle2, Loader2, Plus, ShieldCheck, Sparkles, X } from 'lucide-react';
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
function slug(value: string) { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }

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
  const [message, setMessage] = useState<string | null>(null);

  const institutionId = user.institution_id || user.university?.institution_id || '';
  const campusId = user.campus_id || user.university?.campus_id || '';
  const cityId = user.university?.city_id;
  const fields = useMemo(() => nationalFieldsFor(category || undefined), [category]);
  const safePoints = useMemo(() => safeMeetingPointsFor(campusId, institutionId), [campusId, institutionId]);
  const normalizedAttributes = useMemo(() => normalizeNationalAttributes(fields, attributes), [fields, attributes]);
  const required = useMemo(() => categorySafetyRequirements(category || undefined).required, [category]);
  const missing = required.filter((key) => normalizedAttributes[key] === undefined || normalizedAttributes[key] === null || normalizedAttributes[key] === '');

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
    if (method === 'shipping' && !deliveryMethods.includes('shipping')) setShipping(true);
  };

  const publish = async () => {
    setMessage(null);
    if (!institutionId || !campusId) return setMessage('Primero selecciona tu universidad y campus.');
    if (!title.trim() || !category || !Number.isFinite(Number(price)) || Number(price) < 0) return setMessage('Completa título, categoría y precio.');
    if (!deliveryMethods.length) return setMessage('Selecciona al menos una forma de entrega.');
    if (missing.length) return setMessage(`Faltan datos obligatorios: ${missing.join(', ')}.`);
    if (scope === 'national' && !shipping) return setMessage('Todo México requiere envío disponible.');
    setBusy(true);
    try {
      const now = new Date().toISOString();
      const listing: CanonicalListingV2 = {
        schema_version: 2, seller_id: user.id, institution_id: institutionId, campus_id: campusId, city_id: cityId,
        faculty_id: user.faculty_id || user.university?.faculty_id, career_id: user.career_id || user.university?.career_id,
        category_id: slug(category), title: title.trim().slice(0, 120), description: description.trim().slice(0, 3000),
        attributes: normalizedAttributes, price_mxn: Math.round(Number(price) * 100) / 100, negotiable,
        quantity: Math.max(1, Math.min(99, Number(quantity) || 1)), condition, delivery_methods: deliveryMethods,
        meeting_point_ids: meetingPointId ? [meetingPointId] : [], shipping_available: shipping,
        photo_urls: images.length ? images : [FALLBACK_IMAGE], status: 'active', moderation_status: 'pending', visibility_scope: scope,
        published_at: now, created_at: now, updated_at: now,
      };
      await canonicalListingsBackend.create(listing, category);
      const refreshed = await canonicalListingsBackend.loadMarketplaceProducts({ campusId, institutionId, cityId, limitPerScope: 30 });
      useAppStore.setState({ products: refreshed });
      setMessage('Publicación creada en listings_v2 y enviada a revisión.');
      window.setTimeout(() => setActiveTab('feed'), 700);
    } catch (error) {
      const raw = error instanceof Error ? error.message : String(error);
      setMessage(raw.startsWith('PROHIBITED_LISTING:') ? 'Ese artículo no está permitido en TuTop.' : raw.startsWith('PRIVATE_FIELD_EXPOSED:') ? 'Hay un dato privado que no debe publicarse.' : `No pudimos publicar: ${raw}`);
    } finally { setBusy(false); }
  };

  return <div className="publish-screen pb-[calc(82px+env(safe-area-inset-bottom))]">
    <header className="publish-header pt-safe"><button onClick={() => setActiveTab('feed')} className="icon-button-lg"><ArrowLeft className="h-5 w-5" /></button><div><h1 className="text-lg font-black">Publicar en la red TuTop</h1><p className="text-[10px] text-slate-500">Institución → campus → categoría → alcance</p></div></header>
    <main className="page-pad space-y-3 pt-3">
      <section className="publish-card"><strong className="text-xs">{user.university?.institution_name || institutionId || 'Elige tu universidad'}</strong><p className="mt-1 text-[9px] text-slate-500">{user.university?.campus_name || campusId || 'Falta campus'}{user.university?.career_name ? ` · ${user.university.career_name}` : ''}</p></section>
      <section className="publish-card"><p className="eyebrow">FOTOS</p><div className="mt-2 grid grid-cols-4 gap-2">{images.map((image, index) => <div key={index} className="publish-photo relative"><img src={image} alt={`Foto ${index + 1}`} /><button onClick={() => setImages((current) => current.filter((_, i) => i !== index))}><X /></button></div>)}{images.length < 4 && <button onClick={() => fileRef.current?.click()} className="publish-photo-add"><Plus /><small>Agregar</small></button>}</div><input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(event) => void addPhotos(event.target.files)} /></section>
      <section className="publish-card"><p className="eyebrow">LO ESENCIAL</p><label className="publish-label">Título</label><input className="publish-input" value={title} onChange={(e) => setTitle(e.target.value.slice(0, 120))} /><div className="mt-2 grid grid-cols-2 gap-2"><input className="publish-input" type="number" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Precio" /><input className="publish-input" type="number" min="1" max="99" value={quantity} onChange={(e) => setQuantity(e.target.value)} /></div><label className="publish-label">Categoría</label><select className="publish-input" value={category} onChange={(e) => { setCategory(e.target.value as ProductCategory); setAttributes({}); }}><option value="">Selecciona</option>{MARKETPLACE_CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select><label className="publish-label">Descripción</label><textarea className="publish-textarea" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descripción humana; los datos estructurados van abajo." /><select className="publish-input mt-2" value={condition} onChange={(e) => setCondition(e.target.value)}><option>Nuevo</option><option>Como nuevo</option><option>Buen estado</option><option>Uso visible</option><option>Para reparar</option><option>No aplica</option></select><label className="mt-2 flex items-center gap-2 text-xs"><input type="checkbox" checked={negotiable} onChange={(e) => setNegotiable(e.target.checked)} />Precio negociable</label></section>
      {fields.length > 0 && <section className="publish-card"><div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-300" /><strong className="text-xs">Datos de {category}</strong></div><div className="mt-3 grid grid-cols-2 gap-2">{fields.map((field) => <label key={field.key} className="text-[9px] text-slate-500">{field.label}{field.required ? ' *' : ''}{field.kind === 'boolean' ? <input className="ml-2" type="checkbox" checked={Boolean(attributes[field.key])} onChange={(e) => setAttributes((current) => ({ ...current, [field.key]: e.target.checked }))} /> : <input className="publish-input mt-1" type={field.kind === 'number' ? 'number' : 'text'} value={String(attributes[field.key] ?? '')} onChange={(e) => setAttributes((current) => ({ ...current, [field.key]: e.target.value.slice(0, 300) }))} placeholder={field.placeholder} />}</label>)}</div>{category === 'Cuartos & Renta' && <p className="mt-2 text-[9px] text-amber-200/70">Nunca publiques la dirección exacta; sólo zona aproximada.</p>}</section>}
      <section className="publish-card"><p className="eyebrow">ALCANCE Y ENTREGA</p><div className="mt-2 grid gap-2">{VISIBILITY_SCOPES.map((item) => <button key={item.id} onClick={() => setScope(item.id)} className={`rounded-xl p-3 text-left ${scope === item.id ? 'bg-violet-500/10 ring-1 ring-violet-400/20' : 'bg-white/[0.02]'}`}><strong className="text-[10px]">{item.label}</strong><p className="text-[9px] text-slate-600">{item.hint}</p></button>)}</div><div className="mt-3 flex flex-wrap gap-2">{DELIVERY.map((item) => <button key={item.id} onClick={() => toggleDelivery(item.id)} className={`filter-chip ${deliveryMethods.includes(item.id) ? 'filter-chip-active' : ''}`}>{item.label}</button>)}</div>{scope === 'national' && <label className="mt-2 flex items-center gap-2 text-xs"><input type="checkbox" checked={shipping} onChange={(e) => setShipping(e.target.checked)} />Disponible para envío</label>}{safePoints.length > 0 && <select className="publish-input mt-3" value={meetingPointId} onChange={(e) => setMeetingPointId(e.target.value)}><option value="">Punto a coordinar</option>{safePoints.map((point) => <option key={point.id} value={point.id}>{point.name}</option>)}</select>}</section>
      {category && <section className="publish-card"><div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-violet-300" /><strong className="text-xs">Precio inteligente</strong></div>{pricing ? <p className="mt-2 text-[10px] leading-5 text-slate-400">{pricing.sample_size} comparables · mediana ${pricing.median_mxn.toLocaleString('es-MX')} · vender rápido ${pricing.sell_fast_mxn.toLocaleString('es-MX')} · recomendado <strong className="text-violet-200">${pricing.recommended_mxn.toLocaleString('es-MX')}</strong> · probar alto ${pricing.try_high_mxn.toLocaleString('es-MX')}</p> : <p className="mt-2 text-[9px] text-slate-500">Aún no hay suficientes comparables reales. Topi no inventará un precio.</p>}</section>}
      {message && <div className="rounded-2xl bg-white/[0.04] p-3 text-xs text-slate-300">{message}</div>}
      <button disabled={busy || !institutionId || !campusId} onClick={() => void publish()} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-fuchsia-600 py-4 text-sm font-black disabled:opacity-40">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}Publicar en TuTop V2</button>
    </main>
  </div>;
}
