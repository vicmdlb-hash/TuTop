import { useEffect, useMemo, useState } from 'react';
import { Check, Monitor, Moon, Sun } from 'lucide-react';
import { getThemePreference, setThemePreference, TUTOP_THEME_EVENT, type ThemePreference } from '../lib/theme091';

const OPTIONS: Array<{ id: ThemePreference; label: string; short: string; icon: typeof Sun }> = [
  { id: 'dark', label: 'Oscuro', short: 'Predeterminado', icon: Moon },
  { id: 'light', label: 'Claro', short: 'Más luminoso', icon: Sun },
  { id: 'system', label: 'Automático', short: 'Sigue tu teléfono', icon: Monitor },
];

export default function AppearanceSettings() {
  const [preference, setPreference] = useState<ThemePreference>(() => getThemePreference());
  const current = useMemo(() => OPTIONS.find((option) => option.id === preference) || OPTIONS[0], [preference]);

  useEffect(() => {
    const sync = () => setPreference(getThemePreference());
    window.addEventListener(TUTOP_THEME_EVENT, sync);
    return () => window.removeEventListener(TUTOP_THEME_EVENT, sync);
  }, []);

  const choose = (next: ThemePreference) => {
    setThemePreference(next);
    setPreference(next);
  };

  return (
    <section className="page-pad mt-4 pb-2" aria-labelledby="appearance-title">
      <div className="appearance-card overflow-hidden rounded-[24px] border p-4">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-violet-500/12 text-violet-300">
            <current.icon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="eyebrow">APARIENCIA</p>
            <h2 id="appearance-title" className="mt-1 text-sm font-black">Tema de TuTop</h2>
            <p className="mt-1 text-[9px] leading-4 text-slate-500">TuTop abre en oscuro por defecto. El cambio se aplica al instante y se recuerda.</p>
          </div>
          <span className="rounded-full border border-violet-400/20 bg-violet-500/[0.08] px-2.5 py-1 text-[8px] font-black text-violet-200">{current.label}</span>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2" role="radiogroup" aria-label="Tema de TuTop">
          {OPTIONS.map((option) => {
            const Icon = option.icon;
            const active = preference === option.id;
            return (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => choose(option.id)}
                className={`relative min-h-[86px] rounded-2xl border px-2.5 py-3 text-center transition active:scale-[0.98] ${active ? 'border-violet-400/45 bg-violet-500/[0.11] shadow-[0_0_0_1px_rgba(124,77,255,.10)]' : 'border-white/[0.06] bg-white/[0.025]'}`}
              >
                <span className={`mx-auto grid h-9 w-9 place-items-center rounded-xl ${active ? 'bg-violet-600 text-white' : 'bg-white/[0.04] text-slate-400'}`}>
                  <Icon className="h-4 w-4" />
                </span>
                <strong className="mt-2 block text-[10px]">{option.label}</strong>
                <span className="mt-0.5 block text-[7px] leading-3 text-slate-500">{option.short}</span>
                {active && <span className="absolute right-2 top-2 grid h-5 w-5 place-items-center rounded-full bg-violet-600 text-white"><Check className="h-3 w-3" /></span>}
              </button>
            );
          })}
        </div>

        <div className="mt-3 rounded-2xl border border-white/[0.05] bg-black/10 px-3 py-2.5 text-[8px] leading-4 text-slate-500">
          <strong className="text-slate-300">Oscuro</strong> es la experiencia recomendada. <strong className="text-slate-300">Automático</strong> sólo cambia cuando cambia el tema del teléfono.
        </div>
      </div>
    </section>
  );
}
