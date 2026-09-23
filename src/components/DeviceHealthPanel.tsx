import { useEffect, useMemo, useState } from 'react';
import { Activity, ChevronDown, ChevronUp, RefreshCw, ShieldCheck, TriangleAlert } from 'lucide-react';
import { readLocalDiagnostics, type DiagnosticEntry } from '../services/localDiagnostics';
import { nativePushRegistrationHealth, type PushRegistrationReason } from '../services/nativeFirebaseSecurity';
import { nativeTopiAIStatus, type NativeTopiAIFailureKind, type NativeTopiAIReason } from '../services/nativeTopiAI';

type Snapshot = {
  version: string;
  environment: string;
  topi: ReturnType<typeof nativeTopiAIStatus>;
  push: Awaited<ReturnType<typeof nativePushRegistrationHealth>> | null;
  diagnostics: DiagnosticEntry[];
};

function pushReason(reason?: PushRegistrationReason | null) {
  if (reason === 'registered') return 'token registrado';
  if (reason === 'permission-not-granted') return 'permiso pendiente';
  if (reason === 'ownership-reconciliation-pending') return 'reconciliando cuenta anterior';
  if (reason === 'firebase-config-rejected') return 'configuración Firebase rechazada';
  if (reason === 'network-failure') return 'red insuficiente';
  if (reason === 'server-registration-failed') return 'registro con TuTop falló';
  if (reason === 'token-empty') return 'Firebase no devolvió token';
  if (reason === 'plugin-unavailable') return 'módulo nativo no disponible';
  if (reason === 'token-registration-failed') return 'registro de token falló';
  return 'sin comprobar';
}

function topiReason(reason: NativeTopiAIReason, failure: NativeTopiAIFailureKind) {
  if (reason === 'ready') return 'Firebase AI respondió';
  if (reason === 'not-native') return 'no es runtime Android';
  if (reason === 'disabled') return 'Firebase AI desactivada';
  if (reason === 'plugin-missing') return 'plugin nativo no disponible';
  if (reason === 'app-check-unavailable') return 'App Check no disponible';
  if (reason === 'empty-response') return 'respuesta vacía';
  if (reason === 'request-failed') return failure === 'none' ? 'petición fallida' : `petición fallida · ${failure}`;
  return 'sin prueba real todavía';
}

async function collectSnapshot(): Promise<Snapshot> {
  return {
    version: String(import.meta.env.VITE_TUTOP_APP_VERSION || 'desconocida').slice(0, 40),
    environment: String(import.meta.env.VITE_TUTOP_ENVIRONMENT || 'desconocido').slice(0, 40),
    topi: nativeTopiAIStatus(),
    push: await nativePushRegistrationHealth().catch(() => null),
    diagnostics: readLocalDiagnostics().slice(-12).reverse(),
  };
}

export default function DeviceHealthPanel() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);

  const refresh = async () => {
    setBusy(true);
    try { setSnapshot(await collectSnapshot()); }
    finally { setBusy(false); }
  };

  useEffect(() => {
    if (!open || snapshot) return;
    void refresh();
  }, [open, snapshot]);

  const pushReady = snapshot?.push?.permission === 'granted' && snapshot.push.tokenRegistered === true && !snapshot.push.ownershipReconciliationPending;
  const topiReady = snapshot?.topi.reason === 'ready';
  const recent = useMemo(() => snapshot?.diagnostics || [], [snapshot]);

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.025]">
      <button type="button" className="settings-link w-full text-left" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <span><strong>Diagnóstico de esta instalación</strong><small>Versión, Topi y notificaciones sin mostrar tokens ni datos privados</small></span>
        {open ? <ChevronUp /> : <ChevronDown />}
      </button>
      {open && <div className="border-t border-white/[0.05] p-3">
        {!snapshot ? <p className="text-[9px] text-slate-500">Comprobando estados locales…</p> : <>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-white/[0.03] p-2.5"><span className="text-[8px] text-slate-500">BUILD</span><strong className="mt-1 block text-[10px] text-slate-200">{snapshot.version}</strong><small className="text-[8px] text-slate-600">{snapshot.environment}</small></div>
            <div className="rounded-xl bg-white/[0.03] p-2.5"><span className="text-[8px] text-slate-500">TOPI REAL</span><strong className={`mt-1 block text-[10px] ${topiReady ? 'text-emerald-300' : 'text-amber-300'}`}>{topiReason(snapshot.topi.reason, snapshot.topi.failureKind)}</strong>{snapshot.topi.model && <small className="text-[8px] text-slate-600">{snapshot.topi.model}</small>}</div>
            <div className="rounded-xl bg-white/[0.03] p-2.5"><span className="text-[8px] text-slate-500">PERMISO PUSH</span><strong className="mt-1 block text-[10px] text-slate-200">{snapshot.push?.permission || 'sin comprobar'}</strong></div>
            <div className="rounded-xl bg-white/[0.03] p-2.5"><span className="text-[8px] text-slate-500">TOKEN FCM</span><strong className={`mt-1 block text-[10px] ${pushReady ? 'text-emerald-300' : 'text-amber-300'}`}>{snapshot.push?.ownershipReconciliationPending ? 'reconciliando' : snapshot.push?.tokenRegistered ? 'registrado' : pushReason(snapshot.push?.reason)}</strong></div>
          </div>
          <div className="mt-3 rounded-xl border border-white/[0.05] bg-black/10 p-2.5">
            <div className="flex items-center gap-2">{topiReady && pushReady ? <ShieldCheck className="h-4 w-4 text-emerald-300" /> : <TriangleAlert className="h-4 w-4 text-amber-300" />}<strong className="text-[9px] text-slate-300">{topiReady && pushReady ? 'Estados locales listos' : 'Hay estados que todavía requieren prueba o corrección'}</strong></div>
            <p className="mt-1 text-[8px] leading-4 text-slate-600">Este panel no demuestra entrega FCM real ni reemplaza la prueba física de Topi. Sólo separa permiso, token y estado local de IA para evitar falsos verdes.</p>
          </div>
          <div className="mt-3">
            <div className="flex items-center gap-2"><Activity className="h-3.5 w-3.5 text-slate-500" /><strong className="text-[9px] text-slate-400">Últimos códigos diagnósticos</strong></div>
            <div className="mt-2 max-h-28 space-y-1 overflow-auto">
              {recent.length ? recent.map((entry, index) => <div key={`${entry.at}-${entry.category}-${entry.code}-${index}`} className="rounded-lg bg-white/[0.025] px-2 py-1.5"><span className="text-[8px] font-bold text-slate-400">{entry.category}</span><span className="ml-2 text-[8px] text-slate-600">{entry.code}</span></div>) : <p className="text-[8px] text-slate-600">Todavía no hay eventos diagnósticos locales.</p>}
            </div>
          </div>
        </>}
        <button type="button" disabled={busy} onClick={() => void refresh()} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-violet-500/10 py-2.5 text-[9px] font-black text-violet-200 disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} />Actualizar diagnóstico</button>
      </div>}
    </div>
  );
}
