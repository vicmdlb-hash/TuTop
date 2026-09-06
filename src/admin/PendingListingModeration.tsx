import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, RefreshCw, ShieldCheck, XCircle } from 'lucide-react';
import { scopedAdminBackend } from '../services/scopedAdminBackend';

type ListingDoc = { id: string; data: Record<string, any> };

export default function PendingListingModeration() {
  const [listings, setListings] = useState<ListingDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [allowed, setAllowed] = useState(true);

  const refresh = async () => {
    setLoading(true); setError(null);
    try {
      const docs = await scopedAdminBackend.pendingListings(100);
      setListings(docs as ListingDoc[]);
      setAllowed(true);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      if (/ROLE_SCOPE_DENIED/.test(message)) { setAllowed(false); setListings([]); }
      else setError(message);
    } finally { setLoading(false); }
  };

  useEffect(() => { void refresh(); }, []);

  const moderate = async (listing: ListingDoc, status: 'approved' | 'rejected') => {
    setBusy(listing.id); setError(null);
    try {
      await scopedAdminBackend.moderateListing(listing.id, status, String(listing.data.institution_id || '') || undefined);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally { setBusy(null); }
  };

  if (!allowed) return null;
  return <section className="bg-[#070b12] px-4 pt-4 text-slate-100 sm:px-7 sm:pt-7">
    <div className="mx-auto max-w-7xl rounded-3xl border border-violet-400/10 bg-[#0b111c] p-4 sm:p-5">
      <div className="flex items-center gap-3"><ShieldCheck className="h-5 w-5 text-violet-300"/><div className="min-w-0 flex-1"><p className="text-[10px] font-black uppercase tracking-[.16em] text-violet-300">Publicaciones V2</p><h2 className="text-lg font-black">Pendientes de revisión</h2><p className="text-[10px] text-slate-500">Un anuncio nuevo no entra al feed público hasta aprobarse. Una edición material vuelve a esta cola.</p></div><button onClick={() => void refresh()} className="grid h-9 w-9 place-items-center rounded-xl border border-white/[0.07] bg-white/[0.035] text-slate-400" aria-label="Actualizar publicaciones"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`}/></button></div>
      {error && <p className="mt-3 rounded-xl bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{error}</p>}
      <div className="mt-4 grid gap-3 lg:grid-cols-2">{listings.map((listing) => {
        const photos = Array.isArray(listing.data.photo_urls) ? listing.data.photo_urls : [];
        return <article key={listing.id} className="overflow-hidden rounded-2xl border border-white/[0.06] bg-[#080d16]"><div className="flex gap-3 p-3">{photos[0] ? <img src={String(photos[0])} alt="" className="h-20 w-20 shrink-0 rounded-xl object-cover"/> : <div className="grid h-20 w-20 shrink-0 place-items-center rounded-xl bg-white/[0.04] text-[9px] text-slate-600">Sin foto</div>}<div className="min-w-0 flex-1"><h3 className="truncate text-sm font-black">{String(listing.data.title || 'Sin título')}</h3><p className="mt-1 text-sm font-black text-emerald-300">${Number(listing.data.price_mxn || 0).toLocaleString('es-MX')}</p><p className="mt-1 text-[9px] text-slate-500">{String(listing.data.category_id || 'otros')} · {String(listing.data.institution_id || 'sin institución')} · {String(listing.data.campus_id || 'sin campus')}</p><p className="mt-1 line-clamp-2 text-[9px] leading-4 text-slate-600">{String(listing.data.description || 'Sin descripción')}</p></div></div><div className="grid grid-cols-2 gap-2 border-t border-white/[0.05] p-3"><button disabled={busy === listing.id} onClick={() => void moderate(listing, 'approved')} className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-500/10 py-2.5 text-[10px] font-black text-emerald-300 disabled:opacity-40">{busy === listing.id ? <Loader2 className="h-3.5 w-3.5 animate-spin"/> : <CheckCircle2 className="h-3.5 w-3.5"/>}Aprobar</button><button disabled={busy === listing.id} onClick={() => void moderate(listing, 'rejected')} className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-rose-500/10 py-2.5 text-[10px] font-black text-rose-300 disabled:opacity-40"><XCircle className="h-3.5 w-3.5"/>Rechazar</button></div></article>;
      })}{!loading && !listings.length && <div className="rounded-2xl border border-dashed border-white/[0.07] p-6 text-center text-xs text-slate-600 lg:col-span-2">No hay publicaciones pendientes.</div>}</div>
    </div>
  </section>;
}
