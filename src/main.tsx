import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './services/firebaseSessionHardeningBridge';
import App from './App';
import './index.css';

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch((error) => console.warn('Service worker no disponible', error)));
}
