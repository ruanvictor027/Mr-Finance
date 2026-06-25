/* ============================================================================
   MR Finance — Service Worker (PWA)
   Faz cache do "app shell" MOBILE para instalar como app e abrir OFFLINE.
   ISOLAMENTO: o desktop (mrfinance.html) é EXPLICITAMENTE ignorado pelo SW —
   suas requisições passam direto para a rede, sem cache e sem interceptação,
   então o desktop não passa a depender do mobile de forma alguma.
   Não há regra de negócio aqui; apenas estratégia de cache de arquivos.
   ============================================================================ */
'use strict';
var CACHE = 'mrfinance-shell-v27';

/* Shell mobile a pré-cachear (nomes "base"; o lookup ignora a query ?v=). */
var CORE = [
  './',
  'index.html',
  'mobile.html',
  'mobile.css',
  'mobile.js',
  'mr-core.js',
  'manifest.webmanifest'
];

/* mrfinance.html NUNCA passa pelo SW (mantém o desktop independente). */
function isDesktop(url) { return url.pathname.replace(/\/+$/, '').endsWith('/mrfinance.html') || url.pathname.endsWith('mrfinance.html'); }

self.addEventListener('install', function (e) {
  e.waitUntil((async function () {
    var c = await caches.open(CACHE);
    // cacheia o que conseguir; ignora falhas individuais (ex.: recurso ausente)
    await Promise.all(CORE.map(function (u) { return c.add(new Request(u, { cache: 'reload' })).catch(function () {}); }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', function (e) {
  e.waitUntil((async function () {
    var keys = await caches.keys();
    await Promise.all(keys.map(function (k) { return k === CACHE ? null : caches.delete(k); }));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);

  // Desktop: não interceptar — vai direto para a rede (isolamento total).
  if (isDesktop(url)) return;

  var sameOrigin = url.origin === self.location.origin;

  // Navegações: network-first (mostra updates), com fallback ao cache (offline).
  if (req.mode === 'navigate') {
    e.respondWith((async function () {
      try {
        var fresh = await fetch(req);
        var c = await caches.open(CACHE); c.put(req, fresh.clone());
        return fresh;
      } catch (err) {
        var cached = await caches.match(req, { ignoreSearch: true });
        return cached || (await caches.match('mobile.html', { ignoreSearch: true })) || (await caches.match('index.html', { ignoreSearch: true })) || Response.error();
      }
    })());
    return;
  }

  // Demais assets: stale-while-revalidate.
  e.respondWith((async function () {
    var cached = await caches.match(req, { ignoreSearch: sameOrigin });
    var network = fetch(req).then(function (res) {
      if (res && (res.ok || res.type === 'opaque')) { caches.open(CACHE).then(function (c) { c.put(req, res.clone()); }); }
      return res;
    }).catch(function () { return cached; });
    return cached || network;
  })());
});
