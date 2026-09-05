import { useEffect, useMemo, useState } from 'react';
import { Clock3, Loader2, MapPin, PackageCheck, RotateCcw, ShieldCheck } from 'lucide-react';
import { safeMeetingPointsFor } from '../lib/universityNetwork';
import { nationalBackend, nationalSchemaEnabled } from '../services/nationalBackend';
import type { MarketplaceTransaction, UniversityIdentity } from '../types';

const IDENTITY_KEY = 'tutop.university-identity.v1';

function remainingLabel(expiresAt?: string, now = Date.now()) {
  if (!expiresAt) return null;
  const ms = Date.parse(expiresAt) - now;
  if (!Number.isFinite(ms)) return null;
  if (ms <= 0) return 'Reserva vencida';
  const minutes = Math.ceil(ms / 60000);
  if (minutes < 60) return `${minutes} min restantes`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${hours} h${rest ? ` ${rest} min` : ''} restantes`;
}

function readIdentity(): UniversityIdentity | null {
  try {
    const value = JSON.parse(localStorage.getItem(IDENTITY_KEY) || 'null');
    return value && typeof value === 'object' ? value as UniversityIdentity : null;
  } catch { return null; }
}

export default function TransactionReservationCard({ chatId, currentUserId, onReleased }: { chatId: string; currentUserId: string; onReleased?: () => void }) {
  const [transaction, setTransaction] = useState<MarketplaceTransaction | null>(null);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const identity = useMemo(readIdentity, []);
  const safePoints = useMemo(() => safeMeetingPointsFor(identity?.campus_id, identity?.institution_id).slice(0, 3), [identity?.campus_id, identity?.institution_id]);

  useEffect(() => {
    if (!nationalSchemaEnabled()) return;
    let active = true;
    void nationalBackend.loadTransactionForChat(chatId).then((value) => { if (active) setTransaction(value); }).catch(() => undefined);
    return () => { active = false; };
  }, [chatId]);

  useEffect(() => {
    if (!transaction?.reservation_expires_at || transaction.status !== 'reserved') return;
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, [transaction?.reservation_expires_at, transaction?.status]);

  const remaining = useMemo(() => remainingLabel(transaction?.reservation_expires_at, now), [transaction?.reservation_expires_at, now]);
  const expired = Boolean(transaction?.status === 'reserved' && transaction.reservation_expires_at && Date.parse(transaction.reservation_expires_at) <= now);
  const isSeller = transaction?.seller_id === currentUserId;

  if (!nationalSchemaEnabled() || !transaction) return null;

  const release = async () => {
    if (!expired || !isSeller || busy) return;
    try {
      setBusy(true); setMessage(null);
      const next = await nationalBackend.releaseExpiredReservation(transaction);
      setTransaction(next);
      setMessage('Reserva liberada. La publicación vuelve a estar disponible.');
      onReleased?.();
    } catch { setMessage('No pudimos liberar la reserva. Actualiza e inténtalo otra vez.'); }
    finally { setBusy(false); }
  };

  const copyPoint = async (name: string) => {
    try {
      await navigator.clipboard.writeText(`Propongo encontrarnos en ${name}. Confirmemos día y hora por este chat.`);
      setMessage('Punto seguro copiado. Pégalo en el chat para proponerlo.');
    } catch { setMessage(`Punto sugerido: ${name}`); }
  };

  const statusLabel = transaction.status === 'reserved' ? 'En trato' : transaction.status === 'completed' ? 'Completada' : transaction.status === 'expired' ? 'Reserva vencida' : transaction.status.replace('_', ' ');

  return (
    <section className="mx-4 mt-2 rounded-2xl border border-amber-300/10 bg-amber-500/[0.05] p-3">
      <div className="flex items-start gap-2">
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-amber-400/10 text-amber-300"><PackageCheck className="h-4 w-4" /></div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><strong className="text-[10px] text-amber-100">Operación · {statusLabel}</strong><span className="rounded-full bg-white/5 px-2 py-0.5 text-[8px] text-slate-500">${Number(transaction.agreed_amount_mxn || 0).toLocaleString('es-MX')}</span></div>
          {transaction.status === 'reserved' && <p className={`mt-1 flex items-center gap-1 text-[9px] ${expired ? 'text-rose-300' : 'text-amber-200/70'}`}><Clock3 className="h-3 w-3" />{remaining || 'Reserva activa'}</p>}
          <p className="mt-1 text-[8px] leading-4 text-slate-600">La reserva aparta temporalmente el artículo; no representa un pago ni una garantía de entrega.</p>
        </div>
      </div>

      {transaction.status === 'reserved' && !expired && <div className="mt-3 rounded-xl border border-emerald-400/10 bg-emerald-500/[0.045] p-2.5">
        <div className="flex items-center gap-2"><ShieldCheck className="h-3.5 w-3.5 text-emerald-300" /><div><strong className="block text-[9px] text-emerald-200">Plan de encuentro seguro</strong><span className="text-[8px] text-slate-600">Lugar público + horario confirmado + entrega revisada antes de confirmar.</span></div></div>
        {safePoints.length > 0 ? <div className="mt-2 space-y-1.5">{safePoints.map((point) => <button key={point.id} onClick={() => void copyPoint(point.name)} className="flex w-full items-start gap-2 rounded-lg bg-white/[0.035] px-2.5 py-2 text-left"><MapPin className="mt-0.5 h-3 w-3 shrink-0 text-emerald-300" /><span className="min-w-0"><strong className="block text-[8px] text-slate-300">{point.name}</strong><small className="mt-0.5 block text-[7px] leading-3 text-slate-600">{point.description}</small></span></button>)}</div> : <p className="mt-2 text-[8px] leading-4 text-slate-600">Aún no hay un Punto TuTop validado para este campus. Elijan un lugar público, concurrido y dentro de horario seguro.</p>}
      </div>}

      {expired && isSeller && <button disabled={busy} onClick={() => void release()} className="mt-3 flex h-9 w-full items-center justify-center gap-2 rounded-xl bg-rose-500/10 text-[9px] font-black text-rose-200 disabled:opacity-50">{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}Liberar producto</button>}
      {message && <p className="mt-2 text-[9px] text-slate-400">{message}</p>}
    </section>
  );
}
