import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { initializeTheme091 } from './lib/theme091';
import { getFirebaseConfig } from './services/runtimeConfig';
import { restoreNativeSessionForProject } from './services/nativeSecureSession';
import './index.css';
import './brand091.css';

async function bootstrap() {
  initializeTheme091();
  const config = getFirebaseConfig();
  await restoreNativeSessionForProject(config.projectId).catch(() => ({ restored: false, migrated: false }));
  await import('./services/nativeSecureSessionBridge');
  await import('./services/firebaseSessionHardeningBridge');
  const { default: App } = await import('./App');
  createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);

  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch((error) => console.warn('Service worker no disponible', error)));
  }
}

void bootstrap();
