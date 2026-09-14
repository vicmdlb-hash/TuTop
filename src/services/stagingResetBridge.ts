const RESET_GENERATION = '2026-09-13-physical-failures-1';
const MARKER_KEY = 'tutop.staging-reset.applied.v1';
const THEME_KEY = 'tutop.theme.v2';

export function applyStagingResetIfNeeded() {
  if (typeof window === 'undefined') return false;
  const environment = String(import.meta.env.VITE_TUTOP_ENVIRONMENT || '').trim().toLowerCase();
  const version = String(import.meta.env.VITE_TUTOP_APP_VERSION || '').trim();
  if (environment !== 'staging' || !/^0\.9\.2-beta\./.test(version)) return false;

  try {
    if (localStorage.getItem(MARKER_KEY) === RESET_GENERATION) return false;
    const theme = localStorage.getItem(THEME_KEY);
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('tutop.')) localStorage.removeItem(key);
    }
    sessionStorage.clear();
    if (theme === 'dark' || theme === 'light' || theme === 'system') localStorage.setItem(THEME_KEY, theme);
    localStorage.setItem(MARKER_KEY, RESET_GENERATION);
    return true;
  } catch {
    return false;
  }
}

export const STAGING_RESET_GENERATION = RESET_GENERATION;
