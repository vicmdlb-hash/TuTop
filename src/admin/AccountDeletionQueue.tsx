import { useEffect, useState } from 'react';
import { Loader2, RefreshCw, ShieldAlert, XCircle } from 'lucide-react';
import { scopedAdminBackend } from '../services/scopedAdminBackend';

type RequestDoc = { id: string; data: { uid?: string; status?: string; requested_at?: string; updated_at?: string } };

function when(value?: string) {
  if (!value) return 'sin fecha';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('es-MX');
}

export default function AccountDeletionQueue() {
  const [requests, setRequests] = useState<RequestDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [allowed, setAllowed] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true); setError(null);
    try {
      const docs = await scopedAdminBackend.accountDeletionRequests(100);
      setRequests(docs as RequestDoc[]);
      setAllowed(true);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      if (/ROLE_SCOPE_DENIED/.test(message)) { setAllowed(false); setRequests([]); }
      else setError(message);
    } finally { setLoading(false); }
  };

  useEffect(() => { void refresh(); }, []);

  const transition = async (request: RequestDoc, status: 'processing' | 'rejected') => {
    const uid = String(request.data.uid || request.id);
    if (!uid || busy) return;
    setBusy(uid); setError(null);
    try {
      await scopedAdminBackend.updateAccountDeletionRequest(uid, status);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally { setBusy(null); }
  };

  if (!allowed) return null;
  return <section className="bg-[#070b12] px-4 pt-4 text-slate-100 sm:px-7 sm:pt-7">
    <div className="mx-auto max-w-7xl rounded-3xl border border-rose-400/10 bg-[#0b111c] p-4 sm:p-5">
      <div className="flex items-center gap-3"><ShieldAlert className="h-5 w-5 text-rose-300"/><div className="min-w-0 flex-1"><p className="text-[10px] font-black uppercase tracking-[.16em] text-rose-300">Privacidad / cuenta</p><h2 className="text-lg font-black">Solicitudes de eliminación</h2><p className="text-[10px] leading-4 text-slate-500">Esta cola permite iniciar o rechazar solicitudes. El estado “completada” sólo puede escribirlo el procesador controlado después de terminar el borrado y registrar evidencia.</p></div><button onClick={() => void refresh()} className="grid h-9 w-9 place-items-center rounded-xl border border-white/[0.07] bg-white/[0.035] text-slate-400" aria-label="Actualizar solicitudes"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`}/></button></div>
      {error && <p className="mt-3 rounded-xl bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{error}</p>}
      <div className="mt-4 grid gap-3 lg:grid-cols-2">{requests.map((request) => {
        const uid = String(request.data.uid || request.id);
        const status = String(request.data.status || 'pending');
        return <article key={request.id} className="rounded-2xl border border-white/[0.06] bg-[#080d16] p-3"><div className="flex items-start gap-3"><div className="min-w-0 flex-1"><p className="text-[9px] font-black uppercase tracking-wide text-slate-600">UID</p><p className="mt-1 break-all text-[10px] font-semibold text-slate-300">{uid}</p><div className="mt-2 flex flex-wrap gap-2 text-[9px]"><span className="rounded-full bg-white/[0.04] px-2 py-1 text-slate-400">Estado: <strong className="text-slate-200">{status}</strong></span><span className="rounded-full bg-white/[0.04] px-2 py-1 text-slate-500">Solicitada: {when(request.data.requested_at)}</span></div></div></div><div className="mt-3 grid gap-2 sm:grid-cols-2">{status === 'pending' && <button disabled={busy === uid} onClick={() => void transition(request, 'processing')} className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-amber-500/10 py-2.5 text-[10px] font-black text-amber-200 disabled:opacity-40">{busy === uid ? <Loader2 className="h-3.5 w-3.5 animate-spin"/> : <ShieldAlert className="h-3.5 w-3.5"/>}Iniciar procesamiento</button>}{status === 'processing' && <p className="rounded-xl bg-amber-500/[0.06] px-3 py-2.5 text-center text-[9px] text-amber-200/75">En procesamiento · sólo el procesador controlado puede cerrar la solicitud.</p>}{['pending','processing'].includes(status) && <button disabled={busy === uid} onClick={() => void transition(request, 'rejected')} className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-rose-500/10 py-2.5 text-[10px] font-black text-rose-300 disabled:opacity-40"><XCircle className="h-3.5 w-3.5"/>Rechazar</button>}{['completed','rejected'].includes(status) && <p className="sm:col-span-2 rounded-xl bg-white/[0.025] px-3 py-2 text-center text-[9px] text-slate-600">Solicitud cerrada · última actualización {when(request.data.updated_at)}</p>}</div></article>;
      })}{!loading && !requests.length && <div className="rounded-2xl border border-dashed border-white/[0.07] p-6 text-center text-xs text-slate-600 lg:col-span-2">No hay solicitudes de eliminación.</div>}</div>
    </div>
  </section>;
}
