import { useEffect, useState } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { getThemePreference, setThemePreference, TUTOP_THEME_EVENT, type ThemePreference } from '../lib/theme091';

const OPTIONS: Array<{ id: ThemePreference; label: string; hint: string; icon: typeof Sun }> = [
  { id: 'light', label: 'Claro', hint: 'Blanco + morado', icon: Sun },
  { id: 'dark', label: 'Oscuro', hint: 'Negro + morado', icon: Moon },
  { id: 'system', label: 'Sistema', hint: 'Sigue tu teléfono', icon: Monitor },
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
      <div className="appearance-card">
        <div>
          <p className="eyebrow">APARIENCIA</p>
          <h2 id="appearance-title" className="mt-1 text-sm font-black">TuTop a tu manera</h2>
          <p className="mt-1 text-[9px] text-slate-500">El modo claro usa blanco + morado; el oscuro mantiene negro + morado sin cambiar funciones.</p>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {OPTIONS.map((option) => {
            const Icon = option.icon;
            const active = preference === option.id;
            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={active}
                onClick={() => { setThemePreference(option.id); setPreference(option.id); }}
                className={`appearance-option ${active ? 'appearance-option-active' : ''}`}
              >
                <Icon className="h-4 w-4" />
                <strong>{option.label}</strong>
                <small>{option.hint}</small>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
