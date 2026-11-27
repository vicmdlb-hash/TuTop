// Network-only until authenticated PWA storage is independently accepted.
// Never intercept application requests or supply an HTML fallback for API calls.
const LEGACY_TUTOP_CACHE = 'tutop-shell-v1';
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(
  caches.delete(LEGACY_TUTOP_CACHE).then(() => self.clients.claim())
));
