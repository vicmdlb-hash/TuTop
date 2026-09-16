import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { initializeTheme091 } from './lib/theme091';
import { getFirebaseConfig } from './services/runtimeConfig';
import { clearNativeSessionForProject, restoreNativeSessionForProject } from './services/nativeSecureSession';
import { applyStagingResetIfNeeded } from './services/stagingResetBridge';
import './index.css';
import './brand091.css';
import './brand092.css';
import './brand106.css';

async function bootstrap() {
  // Build 106 intentionally performs one clean beta reset after the confirmed
  // Device A regressions. Clear the encrypted Android session too; otherwise a
  // stale Keystore session can legitimately restore after web storage was reset.
  // This does not delete the Firebase account or any server-side marketplace data.
  const resetApplied = applyStagingResetIfNeeded();
  initializeTheme091();
  const config = getFirebaseConfig();
  if (resetApplied) await clearNativeSessionForProject(config.projectId).catch(() => undefined);
  await restoreNativeSessionForProject(config.projectId).catch(() => ({ restored: false, migrated: false }));
  await import('./services/nativeSecureSessionBridge');
  await import('./services/firebaseSessionHardeningBridge');
  await import('./services/physicalQa106Hardening');
  const { default: App } = await import('./App');
  createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);

  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch((error) => console.warn('Service worker no disponible', error)));
  }
}

void bootstrap();
