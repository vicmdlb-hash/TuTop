import { useMemo, useState } from 'react';
import { BellRing, CircleDollarSign, Loader2, MapPin, Search, Sparkles, X } from 'lucide-react';
import { matchDemandToListings } from '../lib/marketplaceCore';
import { MARKETPLACE_CATEGORIES } from '../lib/productAssistant';
import { VISIBILITY_SCOPES, defaultScopeForCategory } from '../lib/universityNetwork';
import { nationalBackend, nationalSchemaEnabled } from '../services/nationalBackend';
import { useAppStore } from '../store/useAppStore';
import type { DemandRequest, ListingVisibilityScope, Product, ProductCategory } from '../types';

const LOCAL_KEY = 'tutop.demand-requests.v1';

type DemandMatch = { product: Product; score: number };

function saveLocal(request: DemandRequest) {
  try {
    const previous = JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]');
    const list = Array.isArray(previous) ? previous : [];
    localStorage.setItem(LOCAL_KEY, JSON.stringify([request, ...list].slice(0, 30)));
  } catch { /* local fallback is best-effort */ }
}

export default function DemandRequestComposer() {
  const { user, products, openProduct, setActiveTab } = useAppStore();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<ProductCategory | ''>('');
  const [maxPrice, setMaxPrice] = useState('');
  const [neededBy, setNeededBy] = useState('');
  const [scope, setScope] = useState<ListingVisibilityScope>('campus');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [matches, setMatches] = useState<DemandMatch[]>([]);
  const v2Enabled = nationalSchemaEnabled();

  const suggestedScope = useMemo(() => defaultScopeForCategory(category || undefined), [category]);
  const canSubmit = title.trim().length >= 3 && !busy;

  const chooseCategory = (value: ProductCategory | '') => {
    setCategory(value);
    if (value) setScope(defaultScopeForCategory(value));
  };

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setMessage(null);
    setMatches([]);
    const at = new Date().toISOString();
    const base = {
      title: title.trim().slice(0, 120),
      description: description.trim().slice(0, 1200) || undefined,
      category: category || undefined,
      max_price_mxn: maxPrice ? Math.max(0, Number(maxPrice)) : undefined,
      needed_by: neededBy ? new Date(`${neededBy}T23:59:59`).toISOString() : undefined,
      institution_id: user.institution_id || user.university?.institution_id,
      campus_id: user.campus_id || user.university?.campus_id,
      city_id: user.university?.city_id,
      visibility_scope: scope,
    } as const;

    try {
      let created: DemandRequest;
      if (v2Enabled) {
        created = await nationalBackend.createDemandRequest(base);
      } else {
        created = {
          id: `wanted-local-${Date.now()}`,
          buyer_id: user.id,
          ...base,
          status: 'active',
          created_at: at,
          updated_at: at,
        };
        saveLocal(created);
      }
      const found = matchDemandToListings(created, products.filter((product) => product.vendedor_id !== user.id), 5);
      setMatches(found);
      setMessage(found.length
        ? `Encontré ${found.length} ${found.length === 1 ? 'publicación compatible' : 'publicaciones compatibles'} sin contactar a nadie automáticamente.`
        : v2Enabled
          ? 'Tu solicitud ya está activa. Aún no hay una publicación suficientemente compatible.'
          : 'Guardamos tu “Busco…” en este dispositivo. Aún no hay una publicación suficientemente compatible.');
      setTitle('');
      setDescription('');
      setCategory('');
      setMaxPrice('');
      setNeededBy('');
      setScope('campus');
    } catch (error) {
      console.error('[TuTop demand request]', error);
      setMessage('No pudimos sincronizarlo. Revisa tu conexión e inténtalo otra vez.');
    } finally {
      setBusy(false);
    }
  };

  const viewMatch = (productId: string) => {
    setOpen(false);
    setActiveTab('feed');
    openProduct(productId);
  };

  if (!user.id) return null;

  return <>
    <button onClick={() => { setOpen(true); setMessage(null); setMatches([]); }} className="flex min-w-0 w-full items-center justify-center gap-2 rounded-2xl border border-sky-300/15 bg-[#111827]/95 px-3 py-2 text-sky-100 shadow-lg backdrop-blur" aria-label="Publicar lo que buscas">
      <Search className="h-4 w-4 shrink-0 text-sky-300" /><span className="truncate text-[9px] font-black">Busco…</span>
    </button>

    {open && <div className="fixed inset-0 z-[151] grid items-end bg-black/70 p-2 backdrop-blur-sm sm:place-items-center">
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-[28px] border border-white/10 bg-[#0b111c] p-5 text-white shadow-2xl">
        <div className="flex items-start justify-between gap-3"><div><div className="inline-flex items-center gap-1.5 rounded-full bg-sky-500/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-[.14em] text-sky-300"><BellRing className="h-3.5 w-3.5" />Demanda universitaria</div><h2 className="mt-3 text-xl font-black">¿Qué necesitas encontrar?</h2><p className="mt-1 text-xs leading-5 text-slate-500">Publica una necesidad concreta. TuTop revisa el inventario disponible sin mandar mensajes automáticos.</p></div><button onClick={() => setOpen(false)} className="grid h-9 w-9 place-items-center rounded-xl bg-white/5 text-slate-400" aria-label="Cerrar"><X className="h-4 w-4" /></button></div>

        <label className="auth-label">Busco</label><div className="relative"><Search className="absolute left-3 top-3.5 h-4 w-4 text-slate-600" /><input value={title} onChange={(event) => setTitle(event.target.value)} className="auth-input pl-10" maxLength={120} placeholder="Ej. Calculadora Casio para mañana" /></div>

        <label className="auth-label">Categoría <span className="font-normal text-slate-700">(opcional)</span></label><select value={category} onChange={(event) => chooseCategory(event.target.value as ProductCategory | '')} className="auth-input"><option value="">TuTop puede inferirla después</option>{MARKETPLACE_CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}</select>

        <div className="grid grid-cols-2 gap-2"><div><label className="auth-label">Presupuesto máximo</label><div className="relative"><CircleDollarSign className="absolute left-3 top-3.5 h-4 w-4 text-slate-600" /><input value={maxPrice} onChange={(event) => setMaxPrice(event.target.value.replace(/[^0-9.]/g, ''))} className="auth-input pl-10" inputMode="decimal" placeholder="500" /></div></div><div><label className="auth-label">Lo necesito antes de</label><input value={neededBy} min={new Date().toISOString().slice(0, 10)} onChange={(event) => setNeededBy(event.target.value)} className="auth-input" type="date" /></div></div>

        <label className="auth-label">Detalles <span className="font-normal text-slate-700">(opcional)</span></label><textarea value={description} onChange={(event) => setDescription(event.target.value)} className="auth-input min-h-24 resize-none" maxLength={1200} placeholder="Marca, materia, edición, horario, condición que aceptarías…" />

        <label className="auth-label">¿Dónde tiene sentido encontrarlo?</label><div className="grid gap-2">{VISIBILITY_SCOPES.map((item) => <button key={item.id} type="button" onClick={() => setScope(item.id)} className={`rounded-2xl border p-3 text-left ${scope === item.id ? 'border-violet-400/30 bg-violet-500/10' : 'border-white/5 bg-white/[0.02]'}`}><div className="flex items-center justify-between gap-2"><strong className="flex items-center gap-2 text-[10px]"><MapPin className="h-3.5 w-3.5 text-violet-300" />{item.label}</strong>{suggestedScope === item.id && <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[8px] font-black text-emerald-300">SUGERIDO</span>}</div><p className="mt-1 text-[8px] leading-4 text-slate-600">{item.hint}</p></button>)}</div>

        <div className="mt-4 rounded-2xl border border-violet-400/10 bg-violet-500/[0.05] p-3"><div className="flex gap-2"><Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-violet-300" /><p className="text-[9px] leading-4 text-slate-500"><strong className="text-violet-200">Matching sin spam.</strong> TuTop compara texto, categoría, presupuesto y cercanía. Tú decides si abres una publicación; no se contacta a vendedores automáticamente.</p></div></div>

        {message && <p className="mt-4 rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2 text-[9px] leading-4 text-slate-400">{message}</p>}
        {matches.length > 0 && <section className="mt-3 space-y-2"><div className="flex items-center justify-between"><strong className="text-[10px] text-slate-300">Coincidencias ahora</strong><span className="text-[8px] text-slate-600">Sin mensajes automáticos</span></div>{matches.map(({ product, score }) => <button key={product.id} onClick={() => viewMatch(product.id)} className="flex w-full items-center gap-3 rounded-2xl border border-emerald-400/10 bg-emerald-500/[0.045] p-2.5 text-left"><img src={product.imagen_url} alt="" className="h-12 w-12 rounded-xl object-cover" /><span className="min-w-0 flex-1"><strong className="block truncate text-[10px] text-slate-200">{product.titulo}</strong><small className="mt-1 block text-[8px] text-slate-600">{product.facultad} · {Math.round(score * 100)}% compatible</small></span><span className="shrink-0 text-[11px] font-black text-emerald-300">${product.precio_mxn.toLocaleString('es-MX')}</span></button>)}</section>}
        <button disabled={!canSubmit} onClick={() => void submit()} className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-sky-600 to-violet-600 py-3.5 text-sm font-black disabled:opacity-40">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}{busy ? 'Publicando…' : 'Publicar lo que busco'}</button>
        <p className="mt-3 text-center text-[8px] leading-4 text-slate-700">{v2Enabled ? 'Tu solicitud se sincroniza con Firestore V2.' : 'Modo migración: se conserva localmente hasta habilitar Firestore V2.'}</p>
      </div>
    </div>}
  </>;
}
