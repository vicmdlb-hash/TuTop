import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarCheck2, CheckCircle2, Clock3, Loader2, MapPin, PackageCheck, RotateCcw, ShieldCheck } from 'lucide-react';
import { SAFE_MEETING_POINTS, safeMeetingPointsFor } from '../lib/universityNetwork';
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

function defaultMeetupInput() {
  const date = new Date(Date.now() + 60 * 60_000);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export default function TransactionReservationCard({ chatId, currentUserId, onReleased }: { chatId: string; currentUserId: string; onReleased?: () => void }) {
  const [transaction, setTransaction] = useState<MarketplaceTransaction | null>(null);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedPointId, setSelectedPointId] = useState('');
  const [meetupAt, setMeetupAt] = useState(defaultMeetupInput);
  const identity = useMemo(readIdentity, []);
  const safePoints = useMemo(() => safeMeetingPointsFor(identity?.campus_id, identity?.institution_id).slice(0, 3), [identity?.campus_id, identity?.institution_id]);
  const selectedPoint = useMemo(() => SAFE_MEETING_POINTS.find((point) => point.id === (transaction?.meeting_point_id || selectedPointId)), [transaction?.meeting_point_id, selectedPointId]);

  useEffect(() => {
    if (!nationalSchemaEnabled()) return;
    let active = true;
    void nationalBackend.loadTransactionForChat(chatId).then((value) => {
      if (!active) return;
      setTransaction(value);
      if (value?.meeting_point_id) setSelectedPointId(value.meeting_point_id);
      if (value?.meetup_at) {
        const date = new Date(value.meetup_at);
        const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
        setMeetupAt(local.toISOString().slice(0, 16));
      }
    }).catch(() => undefined);
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
  const isBuyer = transaction?.buyer_id === currentUserId;
  const currentUserConfirmed = Boolean(isBuyer ? transaction?.buyer_confirmed_at : transaction?.seller_confirmed_at);
  const otherConfirmed = Boolean(isBuyer ? transaction?.seller_confirmed_at : transaction?.buyer_confirmed_at);

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

  const saveMeetup = async () => {
    if (!selectedPointId || !meetupAt || busy) return;
    try {
      setBusy(true); setMessage(null);
      const next = await nationalBackend.scheduleMeetup(transaction, selectedPointId, new Date(meetupAt).toISOString());
      setTransaction(next);
      setMessage('Encuentro guardado en la operación. La otra persona verá el mismo punto y horario.');
    } catch { setMessage('No pudimos guardar el encuentro. Revisa punto, fecha y hora.'); }
    finally { setBusy(false); }
  };

  const confirmDelivery = async () => {
    if (busy || currentUserConfirmed || transaction.status !== 'meetup_scheduled') return;
    try {
      setBusy(true); setMessage(null);
      const next = await nationalBackend.confirmDelivery(transaction);
      setTransaction(next);
      setMessage(next.status === 'completed' ? 'Entrega confirmada por ambas partes. Operación completada.' : 'Tu confirmación quedó registrada. Falta la confirmación de la otra persona.');
    } catch { setMessage('No pudimos registrar tu confirmación. Actualiza e inténtalo otra vez.'); }
    finally { setBusy(false); }
  };

  const dispute = async () => {
    if (busy || !['reserved', 'meetup_scheduled'].includes(transaction.status)) return;
    try {
      setBusy(true); setMessage(null);
      const next = await nationalBackend.disputeTransaction(transaction);
      setTransaction(next);
      setMessage('Operación marcada en disputa. No la consideraremos completada hasta resolverla.');
    } catch { setMessage('No pudimos abrir la disputa. Actualiza e inténtalo otra vez.'); }
    finally { setBusy(false); }
  };

  const statusLabel = transaction.status === 'reserved' ? 'En trato' : transaction.status === 'meetup_scheduled' ? 'Encuentro programado' : transaction.status === 'completed' ? 'Completada' : transaction.status === 'expired' ? 'Reserva vencida' : transaction.status === 'disputed' ? 'En disputa' : transaction.status.replace('_', ' ');

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

      {['reserved', 'meetup_scheduled'].includes(transaction.status) && !expired && <div className="mt-3 rounded-xl border border-emerald-400/10 bg-emerald-500/[0.045] p-2.5">
        <div className="flex items-center gap-2"><ShieldCheck className="h-3.5 w-3.5 text-emerald-300" /><div><strong className="block text-[9px] text-emerald-200">Plan de encuentro seguro</strong><span className="text-[8px] text-slate-600">Punto sugerido de TuTop + horario compartido dentro de esta operación.</span></div></div>
        {safePoints.length > 0 ? <div className="mt-2 space-y-1.5">{safePoints.map((point) => <button key={point.id} onClick={() => setSelectedPointId(point.id)} className={`flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left ${selectedPointId === point.id || transaction.meeting_point_id === point.id ? 'bg-emerald-400/10 ring-1 ring-emerald-300/20' : 'bg-white/[0.035]'}`}><MapPin className="mt-0.5 h-3 w-3 shrink-0 text-emerald-300" /><span className="min-w-0"><strong className="block text-[8px] text-slate-300">{point.name}</strong><small className="mt-0.5 block text-[7px] leading-3 text-slate-600">{point.description}</small></span></button>)}</div> : <p className="mt-2 text-[8px] leading-4 text-slate-600">Aún no hay un Punto TuTop catalogado para este campus. Por seguridad, esta versión no guarda lugares improvisados como “Punto TuTop”.</p>}
        {safePoints.length > 0 && <div className="mt-2 grid grid-cols-[1fr_auto] gap-2"><input aria-label="Fecha y hora del encuentro" type="datetime-local" value={meetupAt} onChange={(event) => setMeetupAt(event.target.value)} className="min-w-0 rounded-lg border border-white/5 bg-black/20 px-2 py-2 text-[8px] text-slate-300 outline-none" /><button disabled={busy || !selectedPointId || !meetupAt} onClick={() => void saveMeetup()} className="flex items-center justify-center gap-1 rounded-lg bg-emerald-400/10 px-3 text-[8px] font-black text-emerald-200 disabled:opacity-40">{busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <CalendarCheck2 className="h-3 w-3" />}Guardar</button></div>}
        {transaction.meeting_point_id && transaction.meetup_at && <p className="mt-2 text-[8px] leading-4 text-emerald-100/70"><MapPin className="mr-1 inline h-3 w-3" />{selectedPoint?.name || 'Punto TuTop'} · {new Date(transaction.meetup_at).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}</p>}
      </div>}

      {transaction.status === 'meetup_scheduled' && <div className="mt-3 rounded-xl border border-sky-400/10 bg-sky-500/[0.04] p-2.5"><strong className="text-[9px] text-sky-200">Confirmación de entrega</strong><p className="mt-1 text-[8px] leading-4 text-slate-600">Confirma sólo después de revisar y recibir/entregar el artículo. TuTop completa la operación únicamente cuando ambas partes confirman.</p><div className="mt-2 flex items-center gap-2"><button disabled={busy || currentUserConfirmed} onClick={() => void confirmDelivery()} className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg bg-sky-400/10 text-[8px] font-black text-sky-200 disabled:opacity-45">{currentUserConfirmed ? <CheckCircle2 className="h-3 w-3" /> : busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}{currentUserConfirmed ? 'Ya confirmaste' : 'Confirmar entrega'}</button><span className="text-[7px] text-slate-600">Otra parte: {otherConfirmed ? 'confirmó' : 'pendiente'}</span></div></div>}

      {['reserved', 'meetup_scheduled'].includes(transaction.status) && <button disabled={busy} onClick={() => void dispute()} className="mt-2 flex h-8 w-full items-center justify-center gap-1.5 rounded-xl bg-white/[0.035] text-[8px] font-bold text-slate-400 disabled:opacity-40"><AlertTriangle className="h-3 w-3" />Reportar problema con esta operación</button>}
      {expired && isSeller && <button disabled={busy} onClick={() => void release()} className="mt-3 flex h-9 w-full items-center justify-center gap-2 rounded-xl bg-rose-500/10 text-[9px] font-black text-rose-200 disabled:opacity-50">{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}Liberar producto</button>}
      {transaction.status === 'disputed' && <p className="mt-3 rounded-xl bg-rose-500/5 p-2 text-[8px] leading-4 text-rose-200/70">La operación está en disputa. No se puede completar ni modificar el encuentro desde esta tarjeta.</p>}
      {message && <p className="mt-2 text-[9px] text-slate-400">{message}</p>}
    </section>
  );
}
