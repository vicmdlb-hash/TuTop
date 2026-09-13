export type ThemePreference = 'light' | 'dark' | 'system';

const THEME_KEY = 'tutop.theme.v1';
export const TUTOP_THEME_EVENT = 'tutop:theme-change';

function systemTheme(): 'light' | 'dark' {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function getThemePreference(): ThemePreference {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return value === 'dark' || value === 'system' || value === 'light' ? value : 'system';
  } catch {
    return 'system';
  }
}

export function resolveTheme(preference = getThemePreference()): 'light' | 'dark' {
  return preference === 'system' ? systemTheme() : preference;
}

export function applyTheme(preference = getThemePreference()) {
  const resolved = resolveTheme(preference);
  document.documentElement.dataset.theme = resolved;
  document.documentElement.dataset.themePreference = preference;
  document.documentElement.style.colorScheme = resolved;
  return resolved;
}

export function setThemePreference(preference: ThemePreference) {
  try { localStorage.setItem(THEME_KEY, preference); } catch { /* preference is optional */ }
  const resolved = applyTheme(preference);
  window.dispatchEvent(new CustomEvent(TUTOP_THEME_EVENT, { detail: { preference, resolved } }));
  return resolved;
}

export function initializeTheme091() {
  const preference = getThemePreference();
  applyTheme(preference);
  if (typeof window === 'undefined' || !window.matchMedia) return () => undefined;
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const onChange = () => {
    if (getThemePreference() === 'system') {
      const resolved = applyTheme('system');
      window.dispatchEvent(new CustomEvent(TUTOP_THEME_EVENT, { detail: { preference: 'system', resolved } }));
    }
  };
  media.addEventListener?.('change', onChange);
  return () => media.removeEventListener?.('change', onChange);
}
