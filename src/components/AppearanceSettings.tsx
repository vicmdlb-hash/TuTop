import { useEffect, useState } from 'react';
import { Check, Monitor, Moon, Sun } from 'lucide-react';
import { getThemePreference, setThemePreference, TUTOP_THEME_EVENT, type ThemePreference } from '../lib/theme091';

const OPTIONS: Array<{ id: ThemePreference; label: string; hint: string; icon: typeof Sun; badge?: string }> = [
  { id: 'dark', label: 'Oscuro', hint: 'Recomendado para TuTop · negro + morado', icon: Moon, badge: 'Predeterminado' },
  { id: 'light', label: 'Claro', hint: 'Fondo claro con contraste alto', icon: Sun },
  { id: 'system', label: 'Automático', hint: 'Sigue el modo claro u oscuro de tu teléfono', icon: Monitor },
];

export default function AppearanceSettings() {
  const [preference, setPreference] = useState<ThemePreference>(() => getThemePreference());

  useEffect(() => {
    const sync = () => setPreference(getThemePreference());
    window.addEventListener(TUTOP_THEME_EVENT, sync);
    return () => window.removeEventListener(TUTOP_THEME_EVENT, sync);
  }, []);

  return (
    <section className="page-pad mt-4 pb-2" aria-labelledby="appearance-title">
      <div className="appearance-card overflow-hidden rounded-[26px] border p-4">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-violet-500/10 text-violet-300">
            <Moon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="eyebrow">APARIENCIA</p>
            <h2 id="appearance-title" className="mt-1 text-sm font-black">Elige cómo quieres ver TuTop</h2>
            <p className="mt-1 text-[9px] leading-4 text-slate-500">TuTop inicia en oscuro. Puedes cambiarlo cuando quieras sin reiniciar la app.</p>
          </div>
        </div>

        <div className="mt-4 grid gap-2" role="radiogroup" aria-label="Tema de TuTop">
          {OPTIONS.map((option) => {
            const Icon = option.icon;
            const active = preference === option.id;
            return (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => { setThemePreference(option.id); setPreference(option.id); }}
                className={`group flex min-h-[64px] w-full items-center gap-3 rounded-2xl border px-3.5 py-3 text-left transition active:scale-[0.99] ${active ? 'border-violet-400/45 bg-violet-500/[0.10] shadow-[0_0_0_1px_rgba(124,77,255,.12)]' : 'border-white/[0.06] bg-white/[0.025] hover:bg-white/[0.04]'}`}
              >
                <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${active ? 'bg-violet-600 text-white' : 'bg-white/[0.04] text-slate-400'}`}>
                  <Icon className="h-[18px] w-[18px]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <strong className="text-[11px]">{option.label}</strong>
                    {option.badge && <span className="rounded-full bg-violet-500/10 px-2 py-0.5 text-[7px] font-black uppercase tracking-[0.12em] text-violet-300">{option.badge}</span>}
                  </span>
                  <span className="mt-0.5 block text-[9px] leading-4 text-slate-500">{option.hint}</span>
                </span>
                <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border ${active ? 'border-violet-400 bg-violet-600 text-white' : 'border-white/10 text-transparent'}`}>
                  <Check className="h-3.5 w-3.5" />
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
