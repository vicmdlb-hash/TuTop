import { useMemo, useState } from 'react';
import { Archive, CopyPlus, FileText, RotateCcw, Trash2, X } from 'lucide-react';

const CURRENT_DRAFT_KEY = 'tutop.publish.draft.v3';
const SAVED_DRAFTS_KEY = 'tutop.publish.saved.v1';

type SavedDraft = {
  id: string;
  title: string;
  savedAt: string;
  snapshot: unknown;
};

function readSaved(): SavedDraft[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(SAVED_DRAFTS_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item.id === 'string').slice(0, 12) : [];
  } catch {
    return [];
  }
}

function draftTitle(snapshot: unknown) {
  if (!snapshot || typeof snapshot !== 'object') return 'Borrador sin título';
  const record = snapshot as { draft?: { titulo?: string; categoria?: string } };
  return record.draft?.titulo?.trim() || record.draft?.categoria || 'Borrador sin título';
}

export default function DraftShelf() {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState<SavedDraft[]>(() => readSaved());
  const currentAvailable = useMemo(() => {
    try {
      const raw = localStorage.getItem(CURRENT_DRAFT_KEY);
      if (!raw) return false;
      const parsed = JSON.parse(raw) as { draft?: { titulo?: string; precio_mxn?: number; categoria?: string }; images?: string[] };
      return Boolean(parsed.draft?.titulo || parsed.draft?.precio_mxn || parsed.draft?.categoria || parsed.images?.length);
    } catch { return false; }
  }, [open]);

  const persist = (next: SavedDraft[]) => {
    const limited = next.slice(0, 12);
    setSaved(limited);
    try { localStorage.setItem(SAVED_DRAFTS_KEY, JSON.stringify(limited)); } catch { /* local-only best effort */ }
  };

  const saveCurrent = () => {
    try {
      const raw = localStorage.getItem(CURRENT_DRAFT_KEY);
      if (!raw) return;
      const snapshot = JSON.parse(raw) as unknown;
      const item: SavedDraft = {
        id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}`,
        title: draftTitle(snapshot).slice(0, 80),
        savedAt: new Date().toISOString(),
        snapshot,
      };
      persist([item, ...saved]);
      setOpen(true);
    } catch { /* do not block publishing */ }
  };

  const restore = (item: SavedDraft) => {
    try {
      localStorage.setItem(CURRENT_DRAFT_KEY, JSON.stringify(item.snapshot));
      window.location.reload();
    } catch { /* local-only best effort */ }
  };

  const remove = (id: string) => persist(saved.filter((item) => item.id !== id));

  return (
    <>
      <div className="fixed bottom-[calc(88px+env(safe-area-inset-bottom))] right-4 z-[65] flex items-center gap-2">
        {currentAvailable && <button onClick={saveCurrent} className="inline-flex h-11 items-center gap-2 rounded-full border border-violet-400/15 bg-[#17102a]/95 px-4 text-[10px] font-black text-violet-200 shadow-xl backdrop-blur" aria-label="Guardar una copia del borrador"><CopyPlus className="h-4 w-4" />Guardar copia</button>}
        <button onClick={() => setOpen(true)} className="relative grid h-11 w-11 place-items-center rounded-full border border-white/10 bg-[#0c1522]/95 text-slate-200 shadow-xl backdrop-blur" aria-label="Abrir borradores guardados"><Archive className="h-4 w-4" />{saved.length > 0 && <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-violet-600 px-1 text-[8px] font-black text-white">{saved.length}</span>}</button>
      </div>

      {open && <div className="settings-overlay z-[140]" role="dialog" aria-modal="true" aria-label="Borradores guardados"><button className="settings-backdrop" aria-label="Cerrar borradores" onClick={() => setOpen(false)} /><div className="settings-sheet max-h-[72vh] overflow-y-auto"><div className="flex items-center justify-between"><div><p className="eyebrow">PUBLICACIONES</p><h2 className="mt-1 text-xl font-black">Tus borradores</h2><p className="mt-1 text-[10px] text-muted">Se guardan solo en este dispositivo.</p></div><button className="icon-button-lg" onClick={() => setOpen(false)} aria-label="Cerrar"><X className="h-5 w-5" /></button></div>
        {currentAvailable && <button onClick={saveCurrent} className="mt-4 flex w-full items-center gap-3 rounded-2xl border border-violet-400/15 bg-violet-500/[0.07] p-3 text-left"><span className="grid h-9 w-9 place-items-center rounded-xl bg-violet-500/10 text-violet-300"><CopyPlus className="h-4 w-4" /></span><span><strong className="block text-xs">Guardar copia del borrador actual</strong><small className="text-[9px] text-muted">Puedes seguir editando después de guardarla.</small></span></button>}
        <div className="mt-3 space-y-2">{saved.map((item) => <div key={item.id} className="flex items-center gap-3 rounded-2xl border border-white/5 bg-white/[0.025] p-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/[0.04] text-slate-400"><FileText className="h-4 w-4" /></span><div className="min-w-0 flex-1"><strong className="block truncate text-xs">{item.title}</strong><span className="mt-1 block text-[9px] text-muted">Guardado {new Date(item.savedAt).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span></div><button onClick={() => restore(item)} className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-500/10 text-emerald-300" aria-label={`Recuperar ${item.title}`}><RotateCcw className="h-4 w-4" /></button><button onClick={() => remove(item.id)} className="grid h-9 w-9 place-items-center rounded-xl bg-rose-500/10 text-rose-300" aria-label={`Eliminar ${item.title}`}><Trash2 className="h-4 w-4" /></button></div>)}{saved.length === 0 && <div className="empty-card"><strong className="block text-slate-300">Todavía no guardas copias.</strong><span className="mt-1 block">Mientras publicas, toca “Guardar copia” para conservar varios anuncios en preparación.</span></div>}</div>
      </div></div>}
    </>
  );
}
