import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowLeft, CheckCircle2, Clock3, FileKey2, Flag, MessageCircleWarning, RefreshCw, ShieldAlert, ShieldCheck, Store, UserRound, XCircle } from 'lucide-react';
import type { ModerationCaseKind } from '../lib/marketplaceGovernance';
import { scopedAdminBackend, type AdminContext } from '../services/scopedAdminBackend';

type QueueKey = 'credential' | 'product' | 'user' | 'possible_scam' | 'chat' | 'appeal' | 'urgent';
type AdminDoc = { id: string; data: Record<string, any> };

const queues: Array<{ key: QueueKey; label: string; kinds: ModerationCaseKind[] }> = [
  { key: 'credential', label: 'Credenciales', kinds: ['credential'] },
  { key: 'product', label: 'Productos', kinds: ['product', 'prohibited_content'] },
  { key: 'user', label: 'Usuarios', kinds: ['user'] },
  { key: 'possible_scam', label: 'Estafas', kinds: ['possible_scam'] },
  { key: 'chat', label: 'Chats', kinds: ['chat'] },
  { key: 'appeal', label: 'Apelaciones', kinds: ['appeal'] },
  { key: 'urgent', label: 'Urgentes', kinds: ['urgent_incident'] },
];

function roleLabel(context: AdminContext | null) {
  if (!context) return 'Cargando alcance…';
  if (context.role === 'institution_moderator') return `Moderador institucional · ${context.institution_id || 'sin institución'}`;
  if (context.role === 'verification_reviewer') return 'Revisor de credenciales';
  if (context.role === 'support') return 'Soporte / apelaciones';
  if (context.role === 'trust_safety') return 'Trust & Safety global';
  if (context.role === 'moderator') return 'Moderador global';
  return 'Super admin';
}

export default function ScopedModerationDashboard() {
  const [context, setContext] = useState<AdminContext | null>(null);
  const [cases, setCases] = useState<AdminDoc[]>([]);
  const [reports, setReports] = useState<AdminDoc[]>([]);
  const [claims, setClaims] = useState<AdminDoc[]>([]);
  const [audit, setAudit] = useState<AdminDoc[]>([]);
  const [queue, setQueue] = useState<QueueKey>('urgent');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true); setError(null);
    try {
      const admin = await scopedAdminBackend.context();
      setContext(admin);
      const [caseDocs, reportDocs, claimDocs, auditDocs] = await Promise.all([
        scopedAdminBackend.moderationCases(undefined, 200).catch(() => []),
        scopedAdminBackend.reports(200).catch(() => []),
        scopedAdminBackend.noShowClaims(200).catch(() => []),
        scopedAdminBackend.auditLog(80).catch(() => []),
      ]);
      setCases(caseDocs as AdminDoc[]);
      setReports(reportDocs as AdminDoc[]);
      setClaims(claimDocs as AdminDoc[]);
      setAudit(auditDocs as AdminDoc[]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally { setLoading(false); }
  };

  useEffect(() => { void refresh(); }, []);

  const visibleCases = useMemo(() => {
    const meta = queues.find((item) => item.key === queue)!;
    const source = cases.filter((item) => meta.kinds.includes(item.data.kind));
    if (queue === 'urgent') return [...source, ...cases.filter((item) => item.data.priority === 'urgent' && !source.some((candidate) => candidate.id === item.id))];
    return source;
  }, [cases, queue]);

  const queueCount = (key: QueueKey) => {
    const meta = queues.find((item) => item.key === key)!;
    if (key === 'urgent') return cases.filter((item) => item.data.kind === 'urgent_incident' || item.data.priority === 'urgent').filter((item) => !['resolved', 'dismissed'].includes(item.data.status)).length;
    return cases.filter((item) => meta.kinds.includes(item.data.kind) && !['resolved', 'dismissed'].includes(item.data.status)).length;
  };

  const act = async (id: string, fn: () => Promise<void>) => {
    try { setBusy(id); setError(null); await fn(); await refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(null); }
  };

  return (
    <div className="min-h-screen bg-[#070b12] p-4 text-slate-100 sm:p-7">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-wrap items-center gap-3">
          <a href="/admin" className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2 text-xs font-bold text-slate-300"><ArrowLeft className="h-4 w-4"/>MiTuTop Admin</a>
          <div className="min-w-[220px] flex-1"><p className="text-xs font-black uppercase tracking-[0.18em] text-violet-300">Confianza y seguridad</p><h1 className="mt-1 text-2xl font-black">Moderación institucional V2</h1><p className="mt-1 text-sm text-slate-500">{roleLabel(context)}</p></div>
          <button onClick={() => void refresh()} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2 text-xs font-bold text-slate-300"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`}/>Actualizar</button>
        </div>

        {context?.role === 'institution_moderator' && <div className="mt-4 rounded-2xl border border-sky-400/15 bg-sky-400/[0.05] p-4 text-sm text-sky-100/70"><ShieldCheck className="mr-2 inline h-4 w-4 text-sky-300"/>Tu sesión está limitada por Rules y consultas a <strong>{context.institution_id}</strong>. No se cargan casos de otras universidades.</div>}
        {error && <div className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-400/[0.06] p-4 text-sm text-rose-200"><AlertTriangle className="mr-2 inline h-4 w-4"/>{error}</div>}

        <div className="mt-6 flex gap-2 overflow-x-auto pb-2">
          {queues.map((item) => <button key={item.key} onClick={() => setQueue(item.key)} className={`whitespace-nowrap rounded-xl px-3 py-2 text-xs font-black ${queue === item.key ? 'bg-violet-500 text-white' : 'border border-white/[0.07] bg-[#0b111c] text-slate-400'}`}>{item.label} <span className="ml-1 opacity-70">{queueCount(item.key)}</span></button>)}
        </div>

        <div className="mt-4 grid gap-5 xl:grid-cols-[1.25fr_.75fr]">
          <section className="rounded-3xl border border-white/[0.07] bg-[#0b111c] p-4 sm:p-5">
            <div className="flex items-center gap-2"><QueueIcon queue={queue}/><h2 className="font-black">{queues.find((item) => item.key === queue)?.label}</h2><span className="ml-auto text-xs text-slate-600">{visibleCases.length} casos</span></div>
            <div className="mt-4 space-y-3">
              {visibleCases.length ? visibleCases.map((item) => <CaseCard key={item.id} item={item} busy={busy === item.id} onAction={(status) => void act(item.id, () => scopedAdminBackend.resolveModerationCase(item.id, status, item.data.institution_id))}/>) : <Empty text={loading ? 'Consultando Firestore…' : 'No hay casos en esta cola.'}/>}            
            </div>
          </section>

          <div className="space-y-5">
            <section className="rounded-3xl border border-white/[0.07] bg-[#0b111c] p-4 sm:p-5"><div className="flex items-center gap-2"><Flag className="h-4 w-4 text-amber-300"/><h2 className="font-black">Reportes</h2><span className="ml-auto text-xs text-slate-600">{reports.filter((r) => r.data.status === 'open').length} abiertos</span></div><div className="mt-3 max-h-80 space-y-2 overflow-y-auto">{reports.filter((r) => !['resolved','dismissed'].includes(r.data.status)).slice(0,20).map((item) => <div key={item.id} className="rounded-xl border border-white/[0.06] bg-black/10 p-3"><p className="text-xs font-bold">{item.data.target_type} · {item.data.target_id}</p><p className="mt-1 text-xs text-slate-500">{item.data.reason}</p><div className="mt-2 flex gap-2"><SmallButton disabled={busy===item.id} onClick={() => void act(item.id, () => scopedAdminBackend.resolveReport(item.id,'resolved',item.data.institution_id))}>Resolver</SmallButton><SmallButton disabled={busy===item.id} onClick={() => void act(item.id, () => scopedAdminBackend.resolveReport(item.id,'dismissed',item.data.institution_id))}>Descartar</SmallButton></div></div>)}{!reports.length && <Empty text="Sin reportes visibles para tu alcance."/>}</div></section>

            <section className="rounded-3xl border border-white/[0.07] bg-[#0b111c] p-4 sm:p-5"><div className="flex items-center gap-2"><Clock3 className="h-4 w-4 text-rose-300"/><h2 className="font-black">No-show</h2></div><div className="mt-3 space-y-2">{claims.filter((item) => item.data.status === 'open').slice(0,12).map((item) => <div key={item.id} className="rounded-xl border border-white/[0.06] bg-black/10 p-3"><p className="text-xs font-bold">{item.data.kind} · {item.data.transaction_id}</p><p className="mt-1 text-xs text-slate-500">{item.data.reason || 'Sin nota adicional'}</p><div className="mt-2 flex gap-2"><SmallButton disabled={busy===item.id} onClick={() => void act(item.id, () => scopedAdminBackend.resolveNoShowClaim(item.id,'upheld',String(item.data.institution_id)))}>Confirmar no-show</SmallButton><SmallButton disabled={busy===item.id} onClick={() => void act(item.id, () => scopedAdminBackend.resolveNoShowClaim(item.id,'dismissed',String(item.data.institution_id)))}>Descartar</SmallButton></div></div>)}{!claims.some((item)=>item.data.status==='open') && <Empty text="Sin reclamos de no-show abiertos."/>}</div></section>

            <section className="rounded-3xl border border-white/[0.07] bg-[#0b111c] p-4 sm:p-5"><div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-300"/><h2 className="font-black">Audit log</h2><span className="ml-auto text-[10px] text-slate-600">Inmutable</span></div><div className="mt-3 max-h-72 space-y-2 overflow-y-auto">{audit.slice(0,25).map((item)=><div key={item.id} className="rounded-xl bg-black/10 p-2.5"><p className="text-xs font-bold text-slate-300">{item.data.action || 'acción administrativa'}</p><p className="text-[10px] text-slate-600">{item.data.target_type} · {item.data.target_id}</p></div>)}{!audit.length && <Empty text="No hay entradas visibles para tu alcance."/>}</div></section>
          </div>
        </div>
      </div>
    </div>
  );
}

function QueueIcon({ queue }: { queue: QueueKey }) {
  const className = 'h-4 w-4 text-violet-300';
  if (queue === 'credential') return <FileKey2 className={className}/>;
  if (queue === 'product') return <Store className={className}/>;
  if (queue === 'user') return <UserRound className={className}/>;
  if (queue === 'chat') return <MessageCircleWarning className={className}/>;
  return <ShieldAlert className={className}/>;
}

function CaseCard({ item, busy, onAction }: { item: AdminDoc; busy: boolean; onAction: (status: 'reviewing'|'resolved'|'dismissed') => void }) {
  const status = String(item.data.status || 'open');
  const closed = status === 'resolved' || status === 'dismissed';
  return <article className="rounded-2xl border border-white/[0.06] bg-[#080d16] p-4"><div className="flex flex-wrap items-start gap-2"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2 py-1 text-[9px] font-black uppercase ${item.data.priority === 'urgent' ? 'bg-rose-500/15 text-rose-300' : item.data.priority === 'high' ? 'bg-amber-500/15 text-amber-300' : 'bg-white/[0.05] text-slate-500'}`}>{item.data.priority || 'normal'}</span><span className="text-[10px] font-bold uppercase text-violet-300">{item.data.kind}</span><span className="text-[10px] text-slate-600">{item.data.institution_id || 'global'}</span></div><p className="mt-2 text-sm font-bold">{item.data.target_type || 'caso'} · {item.data.target_id || item.id}</p>{item.data.reason && <p className="mt-1 text-xs leading-5 text-slate-500">{item.data.reason}</p>}</div><span className="rounded-full border border-white/[0.07] px-2 py-1 text-[9px] font-black text-slate-500">{status}</span></div>{!closed && <div className="mt-3 flex flex-wrap gap-2"><SmallButton disabled={busy} onClick={() => onAction('reviewing')}>Tomar caso</SmallButton><button disabled={busy} onClick={() => onAction('resolved')} className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/10 px-2.5 py-1.5 text-[10px] font-black text-emerald-300"><CheckCircle2 className="h-3.5 w-3.5"/>Resolver</button><button disabled={busy} onClick={() => onAction('dismissed')} className="inline-flex items-center gap-1 rounded-lg bg-rose-500/10 px-2.5 py-1.5 text-[10px] font-black text-rose-300"><XCircle className="h-3.5 w-3.5"/>Descartar</button></div>}</article>;
}

function SmallButton({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) { return <button disabled={disabled} onClick={onClick} className="rounded-lg border border-white/[0.07] bg-white/[0.04] px-2.5 py-1.5 text-[10px] font-black text-slate-300 disabled:opacity-40">{children}</button>; }
function Empty({ text }: { text: string }) { return <div className="rounded-xl border border-dashed border-white/[0.07] p-5 text-center text-xs text-slate-600">{text}</div>; }
