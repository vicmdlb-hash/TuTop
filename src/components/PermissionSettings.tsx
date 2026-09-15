import { useEffect, useState, type ComponentType } from 'react';
import { Bell, Camera, CheckCircle2, MapPin, Mic, ShieldCheck, TriangleAlert } from 'lucide-react';
import {
  PERMISSION_PRIVACY_COPY,
  queryCapabilityPermission,
  requestCapabilityPermission,
  type CapabilityPermission,
  type PermissionState091,
} from '../lib/permissionCenter091';

type PermissionCard = {
  id: CapabilityPermission;
  label: string;
  hint: string;
  icon: ComponentType<{ className?: string }>;
};

const PERMISSIONS: PermissionCard[] = [
  { id: 'location', label: 'Ubicación aproximada', hint: 'Cerca de ti · 5, 10, 25 y 50 km', icon: MapPin },
  { id: 'camera', label: 'Cámara y galería', hint: 'Selector seguro de Android al publicar', icon: Camera },
  { id: 'microphone', label: 'Micrófono', hint: 'Dictado por voz con Topi', icon: Mic },
  { id: 'notifications', label: 'Notificaciones', hint: 'Mensajes y actividad importante', icon: Bell },
];

function stateLabel(id: CapabilityPermission, state: PermissionState091) {
  if (id === 'camera' && state === 'granted') return 'Disponible';
  if (state === 'granted') return 'Activo';
  if (state === 'prompt') return 'Listo para activar';
  if (state === 'denied') return 'Bloqueado';
  if (state === 'unsupported') return 'No disponible';
  return 'Sin comprobar';
}

function actionLabel(id: CapabilityPermission, state: PermissionState091, busy: boolean) {
  if (busy) return 'Comprobando…';
  if (id === 'camera' && state === 'granted') return 'Verificar';
  return state === 'granted' ? 'Comprobar' : 'Activar';
}

export default function PermissionSettings() {
  const [states, setStates] = useState<Record<CapabilityPermission, PermissionState091>>({
    location: 'unknown', camera: 'unknown', microphone: 'unknown', notifications: 'unknown',
  });
  const [busy, setBusy] = useState<CapabilityPermission | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const refresh = async () => {
    const entries = await Promise.all(PERMISSIONS.map(async ({ id }) => [id, await queryCapabilityPermission(id)] as const));
    setStates(Object.fromEntries(entries) as Record<CapabilityPermission, PermissionState091>);
  };

  useEffect(() => {
    let active = true;
    Promise.all(PERMISSIONS.map(async ({ id }) => [id, await queryCapabilityPermission(id)] as const))
      .then((entries) => { if (active) setStates(Object.fromEntries(entries) as Record<CapabilityPermission, PermissionState091>); })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  const request = async (id: CapabilityPermission) => {
    setBusy(id);
    setNote(null);
    try {
      const result = await requestCapabilityPermission(id);
      setStates((current) => ({ ...current, [id]: result }));
      if (id === 'camera' && result === 'granted') {
        setNote('Cámara/galería disponible. La prueba real se hace desde Publicar: toca Cámara o Galería y Android abrirá su selector del sistema.');
      } else if (id === 'location' && result !== 'granted') {
        setNote('Si Android ya mostró el permiso pero sigue sin ubicación, comprueba que los servicios de ubicación del teléfono estén encendidos y vuelve a intentar.');
      } else if (result === 'denied') {
        setNote('Android tiene este permiso bloqueado. Puedes cambiarlo desde los ajustes de la aplicación.');
      }
    } finally { setBusy(null); }
  };

  return (
    <section className="page-pad mt-4 pb-2" aria-labelledby="permissions-title">
      <div className="appearance-card overflow-hidden rounded-[26px] border p-4">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-violet-500/10 text-violet-300"><ShieldCheck className="h-5 w-5" /></div>
          <div className="min-w-0 flex-1">
            <p className="eyebrow">PERMISOS Y CAPACIDADES</p>
            <h2 id="permissions-title" className="mt-1 text-sm font-black">Comprueba lo que realmente puede usar TuTop</h2>
            <p className="mt-1 text-[9px] leading-4 text-slate-500">No todo funciona como un permiso clásico: cámara y galería usan el selector seguro de Android, mientras ubicación, micrófono y notificaciones sí tienen estados de permiso.</p>
          </div>
        </div>

        <div className="mt-4 space-y-2">
          {PERMISSIONS.map(({ id, label, hint, icon: Icon }) => {
            const state = states[id];
            const active = state === 'granted';
            const blocked = state === 'denied';
            return (
              <div key={id} className="rounded-2xl border border-white/[0.06] bg-white/[0.025] p-3">
                <div className="flex items-center gap-3">
                  <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${active ? 'bg-emerald-500/10 text-emerald-400' : blocked ? 'bg-rose-500/10 text-rose-300' : 'bg-violet-500/10 text-violet-300'}`}><Icon className="h-[18px] w-[18px]" /></div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <strong className="text-[11px]">{label}</strong>
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[8px] font-black ${active ? 'bg-emerald-500/10 text-emerald-400' : blocked ? 'bg-rose-500/10 text-rose-300' : 'bg-violet-500/10 text-violet-300'}`}>
                        {active ? <CheckCircle2 className="h-2.5 w-2.5" /> : blocked ? <TriangleAlert className="h-2.5 w-2.5" /> : null}{stateLabel(id, state)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[9px] text-slate-500">{hint}</p>
                  </div>
                  <button type="button" disabled={busy !== null} onClick={() => void request(id)} className="rounded-xl bg-violet-600 px-3 py-2 text-[9px] font-black text-white disabled:opacity-50">
                    {actionLabel(id, state, busy === id)}
                  </button>
                </div>
                <p className="mt-2 text-[8px] leading-4 text-slate-600">{PERMISSION_PRIVACY_COPY[id]}</p>
              </div>
            );
          })}
        </div>
        {note && <div className="mt-3 rounded-xl border border-violet-300/10 bg-violet-500/[0.05] px-3 py-2 text-[9px] leading-4 text-violet-100/80">{note}</div>}
        <button type="button" onClick={() => void refresh()} className="mt-3 w-full rounded-xl border border-white/[0.06] bg-white/[0.03] py-2.5 text-[9px] font-black text-slate-300">Actualizar estados</button>
      </div>
    </section>
  );
}
