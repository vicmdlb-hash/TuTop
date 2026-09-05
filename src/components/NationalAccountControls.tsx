import { useEffect, useMemo, useState } from 'react';
import { BellRing, ChevronDown, ChevronUp, Loader2, ShieldAlert, Trash2 } from 'lucide-react';
import { DEFAULT_NOTIFICATION_PREFERENCES, NOTIFICATION_PRIORITY, type NotificationPreferenceKey, type NotificationPreferences } from '../lib/notificationPreferences.ts';
import { nationalSchemaEnabled } from '../services/nationalBackend.ts';
import { nationalUserSettings, type AccountDeletionRequest } from '../services/nationalUserSettings.ts';

const LABELS: Record<NotificationPreferenceKey, string> = {
  new_message: 'Nuevo mensaje',
  offer_received: 'Oferta recibida',
  offer_accepted: 'Oferta aceptada',
  counter_offer: 'Contraoferta',
  reservation_expiring: 'Reserva por vencer',
  meetup_reminder: 'Recordatorio de encuentro',
  saved_search_match: 'Producto de búsqueda guardada',
  favorite_price_drop: 'Favorito bajó de precio',
  saved_item_available: 'Favorito sigue disponible',
  followed_seller_new_listing: 'Nuevo producto de vendedor seguido',
  listing_saved_count: 'Tu publicación recibió guardados',
  weekly_digest: 'Resumen semanal',
  safety_alert: 'Alerta de seguridad',
};

export default function NationalAccountControls() {
  const enabled = nationalSchemaEnabled();
  const [open, setOpen] = useState(false);
  const [preferences, setPreferences] = useState<NotificationPreferences>({ ...DEFAULT_NOTIFICATION_PREFERENCES });
  const [busyKey, setBusyKey] = useState<NotificationPreferenceKey | null>(null);
  const [deletion, setDeletion] = useState<AccountDeletionRequest | null>(null);
  const [deletionBusy, setDeletionBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    void Promise.all([
      nationalUserSettings.loadNotificationPreferences().catch(() => ({ ...DEFAULT_NOTIFICATION_PREFERENCES })),
      nationalUserSettings.accountDeletionStatus().catch(() => null),
    ]).then(([prefs, request]) => {
      if (!active) return;
      setPreferences(prefs);
      setDeletion(request);
    });
    return () => { active = false; };
  }, [enabled]);

  const highPriority = useMemo(() => (Object.keys(preferences) as NotificationPreferenceKey[]).filter((key) => NOTIFICATION_PRIORITY[key] === 'high'), [preferences]);
  const optional = useMemo(() => (Object.keys(preferences) as NotificationPreferenceKey[]).filter((key) => NOTIFICATION_PRIORITY[key] !== 'high'), [preferences]);

  if (!enabled) return null;

  const toggle = async (key: NotificationPreferenceKey) => {
    const next = { ...preferences, [key]: !preferences[key] };
    setPreferences(next);
    setBusyKey(key);
    setMessage(null);
    try {
      const saved = await nationalUserSettings.saveNotificationPreferences(next);
      setPreferences(saved);
    } catch {
      setPreferences(preferences);
      setMessage('No pudimos guardar esa preferencia.');
    } finally { setBusyKey(null); }
  };

  const requestDeletion = async () => {
    if (deletion || deletionBusy) return;
    const confirmed = window.confirm('¿Quieres solicitar la eliminación de tu cuenta y datos? Algunas evidencias de fraude, disputas u obligaciones legales pueden conservarse temporalmente según la política de retención.');
    if (!confirmed) return;
    setDeletionBusy(true);
    setMessage(null);
    try {
      const request = await nationalUserSettings.requestAccountDeletion();
      setDeletion(request);
      setMessage('Solicitud registrada. TuTop no la tratará como una simple desactivación.');
    } catch {
      setMessage('No pudimos registrar la solicitud de eliminación.');
    } finally { setDeletionBusy(false); }
  };

  const renderToggle = (key: NotificationPreferenceKey) => (
    <button key={key} type="button" onClick={() => void toggle(key)} disabled={busyKey === key} className="flex w-full items-center justify-between gap-3 rounded-xl border border-white/[0.05] bg-white/[0.025] px-3 py-2.5 text-left disabled:opacity-60">
      <span><strong className="block text-[10px] text-slate-200">{LABELS[key]}</strong><small className="text-[8px] text-slate-500">{NOTIFICATION_PRIORITY[key] === 'high' ? 'Alta prioridad' : NOTIFICATION_PRIORITY[key] === 'normal' ? 'Prioridad normal' : 'Baja prioridad'}</small></span>
      <span className={`relative h-5 w-9 rounded-full transition ${preferences[key] ? 'bg-violet-500' : 'bg-slate-700'}`}><span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition ${preferences[key] ? 'left-[18px]' : 'left-0.5'}`} /></span>
    </button>
  );

  return (
    <section className="mx-4 mt-4 rounded-2xl border border-white/[0.06] bg-[#0b1420] p-3">
      <button type="button" onClick={() => setOpen((value) => !value)} className="flex w-full items-center gap-2 text-left">
        <BellRing className="h-4 w-4 text-violet-300" />
        <span className="flex-1"><strong className="block text-[11px]">Notificaciones y privacidad V2</strong><small className="text-[9px] text-slate-500">Control granular, sin notificaciones basura.</small></span>
        {open ? <ChevronUp className="h-4 w-4 text-slate-500" /> : <ChevronDown className="h-4 w-4 text-slate-500" />}
      </button>

      {open && <div className="mt-3 space-y-2">
        <p className="text-[9px] font-black uppercase tracking-wide text-slate-500">Importantes</p>
        {highPriority.map(renderToggle)}
        <p className="pt-2 text-[9px] font-black uppercase tracking-wide text-slate-500">Opcionales</p>
        {optional.map(renderToggle)}

        <div className="mt-4 rounded-xl border border-rose-400/10 bg-rose-500/[0.04] p-3">
          <div className="flex gap-2"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" /><div><strong className="block text-[10px] text-rose-200">Eliminar cuenta y datos</strong><p className="mt-1 text-[9px] leading-relaxed text-slate-500">La solicitud es distinta de cerrar sesión o desactivar la cuenta. Datos necesarios para disputas, fraude u obligaciones justificadas pueden conservarse temporalmente.</p></div></div>
          {deletion ? <div className="mt-3 rounded-lg bg-white/[0.04] px-3 py-2 text-[9px] text-slate-300">Estado de solicitud: <strong>{deletion.status}</strong></div> : <button type="button" onClick={() => void requestDeletion()} disabled={deletionBusy} className="mt-3 inline-flex h-9 w-full items-center justify-center gap-2 rounded-xl bg-rose-500/10 text-[9px] font-black text-rose-300 disabled:opacity-50">{deletionBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}Solicitar eliminación</button>}
        </div>
        {message && <p className="rounded-xl bg-white/[0.03] px-3 py-2 text-[9px] text-slate-300">{message}</p>}
      </div>}
    </section>
  );
}
