import { useEffect, useState } from 'react';
import { Laptop, Moon, Sun } from 'lucide-react';
import { getThemePreference, setThemePreference, TUTOP_THEME_EVENT, type ThemePreference } from '../lib/theme091';

const OPTIONS: Array<{ id: ThemePreference; label: string; hint: string; icon: typeof Sun }> = [
  { id: 'light', label: 'Claro', hint: 'Blanco + morado', icon: Sun },
  { id: 'dark', label: 'Oscuro', hint: 'Negro + morado', icon: Moon },
  { id: 'system', label: 'Sistema', hint: 'Automático', icon: Laptop },
];

export default function ThemeSwitcher091() {
  const [preference, setPreference] = useState<ThemePreference>(() => getThemePreference());

  useEffect(() => {
    const onTheme = (event: Event) => {
      const detail = (event as CustomEvent<{ preference?: ThemePreference }>).detail;
      if (detail?.preference) setPreference(detail.preference);
    };
    window.addEventListener(TUTOP_THEME_EVENT, onTheme);
    return () => window.removeEventListener(TUTOP_THEME_EVENT, onTheme);
  }, []);

  const choose = (next: ThemePreference) => {
    setPreference(next);
    setThemePreference(next);
  };

  return (
    <section className="appearance-card" aria-label="Apariencia de TuTop">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-violet-500">Apariencia</p>
          <h3 className="mt-1 text-sm font-black">TuTop a tu estilo</h3>
          <p className="mt-1 text-[9px] text-muted">Cambia entre blanco/morado y negro/morado. Tu elección se conserva en este dispositivo.</p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {OPTIONS.map((option) => {
          const Icon = option.icon;
          const active = preference === option.id;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => choose(option.id)}
              className={`appearance-option ${active ? 'appearance-option-active' : ''}`}
              aria-pressed={active}
            >
              <Icon className="h-4 w-4" />
              <strong>{option.label}</strong>
              <small>{option.hint}</small>
            </button>
          );
        })}
      </div>
    </section>
  );
}
