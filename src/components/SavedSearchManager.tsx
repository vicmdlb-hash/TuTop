import { useEffect, useState } from 'react';
import { BellOff, BellRing, Loader2, Search, Trash2 } from 'lucide-react';
import { nationalBackend } from '../services/nationalBackend';
import type { SavedSearch } from '../types';

function scopeLabel(search: SavedSearch) {
  if (search.visibility_scope === 'national') return 'Todo México';
  if (search.visibility_scope === 'institution') return 'Universidad';
  if (search.visibility_scope === 'campus') return 'Campus';
  if (search.visibility_scope === 'city') return 'Ciudad';
  return search.visibility_scope;
}

export default function SavedSearchManager({ accountPreferenceEnabled }: { accountPreferenceEnabled: boolean }) {
  const [searches, setSearches] = useState<SavedSearch[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const reload = async () => {
    try {
      setLoading(true);
      setMessage(null);
      setSearches(await nationalBackend.listSavedSearches(30));
    } catch {
      setMessage('No pudimos cargar tus búsquedas guardadas.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void reload(); }, []);

  const toggle = async (search: SavedSearch) => {
    try {
      setBusyId(search.id);
      setMessage(null);
      const updated = await nationalBackend.setSavedSearchNotifications(search.id, !search.notifications_enabled);
      setSearches((current) => current.map((item) => item.id === search.id ? updated : item));
    } catch {
      setMessage('No pudimos cambiar esta alerta. Inténtalo de nuevo.');
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (searchId: string) => {
    if (confirmDeleteId !== searchId) {
      setConfirmDeleteId(searchId);
      return;
    }
    try {
      setBusyId(searchId);
      setMessage(null);
      await nationalBackend.deleteSavedSearch(searchId);
      setSearches((current) => current.filter((item) => item.id !== searchId));
      setConfirmDeleteId(null);
    } catch {
      setMessage('No pudimos borrar esta búsqueda. Inténtalo de nuevo.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mt-5 border-t border-white/[0.06] pt-4" aria-labelledby="saved-search-alerts-title">
      <div className="flex items-start gap-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-violet-500/10 text-violet-300"><Search className="h-4 w-4" /></div>
        <div className="min-w-0 flex-1">
          <h4 id="saved-search-alerts-title" className="text-[11px] font-black text-slate-200">Mis alertas guardadas</h4>
          <p className="mt-1 text-[8px] leading-4 text-slate-500">Cada búsqueda tiene su propio interruptor. Además, “Búsquedas guardadas” arriba debe estar activado para permitir avisos.</p>
        </div>
      </div>

      {!accountPreferenceEnabled && <p className="mt-3 rounded-xl border border-amber-400/10 bg-amber-500/[0.05] px-3 py-2 text-[8px] leading-4 text-amber-100">La preferencia general “Búsquedas guardadas” está apagada. Tus búsquedas se conservan, pero no deben proyectar avisos.</p>}

      {loading ? <div className="mt-3 flex items-center gap-2 text-[9px] text-slate-500"><Loader2 className="h-3.5 w-3.5 animate-spin" />Cargando búsquedas…</div> : (
        <div className="mt-3 space-y-2">
          {searches.length === 0 && <p className="rounded-xl bg-black/10 px-3 py-3 text-[9px] text-slate-500">Todavía no tienes búsquedas guardadas.</p>}
          {searches.map((search) => (
            <div key={search.id} className="rounded-2xl border border-white/[0.05] bg-black/10 p-3">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <strong className="block truncate text-[10px] text-slate-200">{search.query}</strong>
                  <span className="mt-1 block text-[8px] leading-4 text-slate-500">
                    {[search.category, scopeLabel(search), typeof search.max_price_mxn === 'number' ? `Hasta $${search.max_price_mxn.toLocaleString('es-MX')} MXN` : null].filter(Boolean).join(' · ')}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => void toggle(search)}
                  disabled={busyId === search.id}
                  aria-pressed={search.notifications_enabled}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/[0.04] text-slate-300 disabled:opacity-50"
                  aria-label={search.notifications_enabled ? `Pausar alerta ${search.query}` : `Reanudar alerta ${search.query}`}
                >
                  {busyId === search.id ? <Loader2 className="h-4 w-4 animate-spin" /> : search.notifications_enabled ? <BellRing className="h-4 w-4 text-violet-300" /> : <BellOff className="h-4 w-4" />}
                </button>
              </div>
              <button
                type="button"
                disabled={busyId === search.id}
                onClick={() => void remove(search.id)}
                className={`mt-2 inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[8px] font-bold ${confirmDeleteId === search.id ? 'bg-rose-500/15 text-rose-200' : 'text-slate-600'}`}
              >
                <Trash2 className="h-3 w-3" aria-hidden="true" />{confirmDeleteId === search.id ? 'Confirmar borrar' : 'Borrar'}
              </button>
            </div>
          ))}
        </div>
      )}
      {message && <p role="status" aria-live="polite" aria-atomic="true" className="mt-3 text-[8px] leading-4 text-rose-200">{message}</p>}
      <p className="mt-3 text-[8px] leading-4 text-slate-600">Estos controles configuran elegibilidad; no prueban que un worker ni FCM hayan entregado un aviso real.</p>
    </div>
  );
}
