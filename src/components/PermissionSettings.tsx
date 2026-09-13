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
  { id: 'camera', label: 'Cámara y galería', hint: 'Fotos del sistema al publicar', icon: Camera },
  { id: 'microphone', label: 'Micrófono', hint: 'Dictado por voz con Topi', icon: Mic },
  { id: 'notifications', label: 'Notificaciones', hint: 'Mensajes y actividad importante', icon: Bell },
];

const STATE_LABEL: Record<PermissionState091, string> = {
  granted: 'Activo', prompt: 'Listo para activar', denied: 'Bloqueado', unsupported: 'No disponible', unknown: 'Sin comprobar',
};

export default function PermissionSettings() {
  const [states, setStates] = useState<Record<CapabilityPermission, PermissionState091>>({
    location: 'unknown', camera: 'unknown', microphone: 'unknown', notifications: 'unknown',
  });
  const [busy, setBusy] = useState<CapabilityPermission | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all(PERMISSIONS.map(async ({ id }) => [id, await queryCapabilityPermission(id)] as const))
      .then((entries) => { if (active) setStates(Object.fromEntries(entries) as Record<CapabilityPermission, PermissionState091>); })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  const request = async (id: CapabilityPermission) => {
    setBusy(id);
    try {
      const result = await requestCapabilityPermission(id);
      setStates((current) => ({ ...current, [id]: result }));
    } finally { setBusy(null); }
  };

  return (
    <section className="page-pad mt-4 pb-2" aria-labelledby="permissions-title">
      <div className="appearance-card">
        <div className="flex items-start gap-2">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-violet-400" />
          <div>
            <p className="eyebrow">PERMISOS</p>
            <h2 id="permissions-title" className="mt-1 text-sm font-black">Tú decides cuándo activarlos</h2>
            <p className="mt-1 text-[9px] leading-4 text-slate-500">Ubicación, cámara, micrófono y notificaciones se solicitan sólo cuando los usas. Aquí puedes comprobarlos sin entrar a menús técnicos.</p>
          </div>
        </div>

        <div className="mt-3 space-y-2">
          {PERMISSIONS.map(({ id, label, hint, icon: Icon }) => {
            const state = states[id];
            const active = state === 'granted';
            const blocked = state === 'denied';
            return (
              <div key={id} className="rounded-2xl border border-white/[0.06] bg-white/[0.025] p-3">
                <div className="flex items-center gap-3">
                  <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${active ? 'bg-emerald-500/10 text-emerald-400' : blocked ? 'bg-rose-500/10 text-rose-300' : 'bg-violet-500/10 text-violet-300'}`}><Icon className="h-4 w-4" /></div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <strong className="text-[11px]">{label}</strong>
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[8px] font-black ${active ? 'bg-emerald-500/10 text-emerald-400' : blocked ? 'bg-rose-500/10 text-rose-300' : 'bg-violet-500/10 text-violet-300'}`}>
                        {active ? <CheckCircle2 className="h-2.5 w-2.5" /> : blocked ? <TriangleAlert className="h-2.5 w-2.5" /> : null}{STATE_LABEL[state]}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[9px] text-slate-500">{hint}</p>
                  </div>
                  <button type="button" disabled={busy !== null} onClick={() => void request(id)} className="rounded-xl bg-violet-600 px-3 py-2 text-[9px] font-black text-white disabled:opacity-50">
                    {busy === id ? 'Activando…' : active ? 'Comprobar' : 'Activar'}
                  </button>
                </div>
                <p className="mt-2 text-[8px] leading-4 text-slate-600">{PERMISSION_PRIVACY_COPY[id]}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
