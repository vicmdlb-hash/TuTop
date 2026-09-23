import { useEffect, useState } from 'react';
import { BellRing, CheckCircle2, Loader2 } from 'lucide-react';
import { DEFAULT_NOTIFICATION_PREFERENCES, type NotificationPreferenceKey, type NotificationPreferences } from '../lib/notificationPreferences';
import { nationalSchemaEnabled } from '../services/nationalBackend';
import { nationalUserSettings } from '../services/nationalUserSettings';
import SavedSearchManager from './SavedSearchManager';

const OPTIONS: Array<{ key: NotificationPreferenceKey; label: string; hint: string }> = [
  { key: 'new_message', label: 'Mensajes nuevos', hint: 'Cuando alguien te escribe.' },
  { key: 'offer_received', label: 'Ofertas recibidas', hint: 'Nuevas ofertas sobre tus publicaciones.' },
  { key: 'offer_accepted', label: 'Oferta aceptada', hint: 'Cambios importantes en una negociación.' },
  { key: 'counter_offer', label: 'Contraofertas', hint: 'Cuando cambia la propuesta de precio.' },
  { key: 'reservation_expiring', label: 'Reserva por vencer', hint: 'Antes de que una reserva expire.' },
  { key: 'meetup_reminder', label: 'Recordatorios de encuentro', hint: 'Avisos de una entrega acordada.' },
  { key: 'saved_search_match', label: 'Búsquedas guardadas', hint: 'Cuando aparece algo que coincide con una búsqueda.' },
  { key: 'favorite_price_drop', label: 'Bajadas de precio', hint: 'Cambios en productos que guardaste.' },
  { key: 'saved_item_available', label: 'Favorito disponible', hint: 'Cuando un artículo guardado vuelve a estar disponible.' },
  { key: 'followed_seller_new_listing', label: 'Nuevas publicaciones de vendedores', hint: 'Actividad de vendedores que sigues cuando esa función esté activa.' },
  { key: 'listing_saved_count', label: 'Veces que guardan tu anuncio', hint: 'Señales de interés sobre tus publicaciones.' },
  { key: 'weekly_digest', label: 'Resumen semanal', hint: 'Resumen no urgente de actividad.' },
  { key: 'safety_alert', label: 'Alertas de seguridad', hint: 'Avisos importantes sobre tu cuenta o una operación.' },
];

export default function NotificationPreferenceSettings() {
  const [preferences, setPreferences] = useState<NotificationPreferences>({ ...DEFAULT_NOTIFICATION_PREFERENCES });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!nationalSchemaEnabled()) { setLoading(false); return; }
    let active = true;
    void nationalUserSettings.loadNotificationPreferences()
      .then((next) => { if (active) setPreferences(next); })
      .catch(() => { if (active) setMessage('No pudimos cargar tus preferencias. Se muestran los valores predeterminados.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  if (!nationalSchemaEnabled()) return null;

  const toggle = (key: NotificationPreferenceKey) => {
    setMessage(null);
    setPreferences((current) => ({ ...current, [key]: !current[key] }));
  };

  const save = async () => {
    try {
      setSaving(true);
      setMessage(null);
      const persisted = await nationalUserSettings.saveNotificationPreferences(preferences);
      setPreferences(persisted);
      setMessage('Preferencias guardadas en tu cuenta.');
    } catch {
      setMessage('No pudimos guardar las preferencias. Revisa tu conexión e inténtalo otra vez.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-4 rounded-[26px] border border-white/[0.06] bg-white/[0.025] p-4" aria-labelledby="notification-preferences-title">
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-sky-500/10 text-sky-300"><BellRing className="h-5 w-5" /></div>
        <div className="min-w-0 flex-1">
          <p className="eyebrow">QUÉ QUIERES RECIBIR</p>
          <h3 id="notification-preferences-title" className="mt-1 text-sm font-black">Preferencias de notificación</h3>
          <p className="mt-1 text-[9px] leading-4 text-slate-500">El permiso de Android controla si TuTop puede notificarte. Estos controles eligen qué tipos de avisos prepara TuTop para tu cuenta.</p>
        </div>
      </div>

      {loading ? <div className="mt-4 flex items-center gap-2 text-[9px] text-slate-500"><Loader2 className="h-3.5 w-3.5 animate-spin" />Cargando preferencias…</div> : (
        <div className="mt-4 space-y-2">
          {OPTIONS.map((option) => (
            <button
              type="button"
              key={option.key}
              onClick={() => toggle(option.key)}
              role="switch"
              aria-checked={preferences[option.key]}
              aria-label={`${option.label}: ${preferences[option.key] ? 'activada' : 'desactivada'}`}
              className="flex w-full items-center gap-3 rounded-2xl border border-white/[0.05] bg-black/10 p-3 text-left"
            >
              <span className="min-w-0 flex-1"><strong className="block text-[10px] text-slate-200">{option.label}</strong><span className="mt-0.5 block text-[8px] leading-4 text-slate-500">{option.hint}</span></span>
              <span className={`relative h-6 w-11 shrink-0 rounded-full transition ${preferences[option.key] ? 'bg-violet-600' : 'bg-slate-700'}`} aria-hidden="true">
                <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition ${preferences[option.key] ? 'left-6' : 'left-1'}`} />
              </span>
            </button>
          ))}
        </div>
      )}

      {message && <p role="status" aria-live="polite" aria-atomic="true" className="mt-3 flex items-start gap-1.5 rounded-xl bg-white/[0.03] px-3 py-2 text-[9px] leading-4 text-slate-400">{message.startsWith('Preferencias guardadas') && <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-emerald-400" aria-hidden="true" />}{message}</p>}
      <button type="button" disabled={loading || saving} onClick={() => void save()} className="mt-3 w-full rounded-xl bg-violet-600 py-2.5 text-[9px] font-black text-white disabled:opacity-50">
        {saving ? 'Guardando…' : 'Guardar preferencias'}
      </button>
      <p className="mt-2 text-[8px] leading-4 text-slate-600">Cambiar estas opciones no prueba entrega FCM. La entrega real sigue siendo un gate físico separado.</p>
      <SavedSearchManager accountPreferenceEnabled={preferences.saved_search_match} />
    </div>
  );
}
