/* MR Finance — service worker (offline-first) */
const CACHE = 'mrfinance-v77';
const ASSETS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'vendor/pdf.min.js',
  'vendor/pdf.worker.min.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  e.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        try {
          const u = new URL(req.url);
          const sameOrigin = u.origin === self.location.origin;
          const isFont = /fonts\.(googleapis|gstatic)\.com$/.test(u.host);
          if (res && (res.status === 200 || res.type === 'opaque') && (sameOrigin || isFont)) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
        } catch (_) {}
        return res;
      }).catch(() => {
        // offline: para navegações, devolve o app
        if (req.mode === 'navigate') return caches.match('index.html');
        return caches.match(req);
      });
    })
  );
});
