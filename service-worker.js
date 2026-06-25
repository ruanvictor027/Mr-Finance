/* ============================================================================
   MR Finance — Service Worker (PWA)
   Faz cache do "app shell" MOBILE para instalar como app e abrir OFFLINE.
   ISOLAMENTO: o desktop (mrfinance.html) é EXPLICITAMENTE ignorado pelo SW —
   suas requisições passam direto para a rede, sem cache e sem interceptação,
   então o desktop não passa a depender do mobile de forma alguma.
   Não há regra de negócio aqui; apenas estratégia de cache de arquivos.
   ============================================================================ */
'use strict';
var CACHE = 'mrfinance-shell-v89';

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

/* Permite que a página force a ativação imediata de um SW novo. */
self.addEventListener('message', function (e) { if (e.data === 'skipWaiting') self.skipWaiting(); });

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);

  // Desktop: não interceptar — vai direto para a rede (isolamento total).
  if (isDesktop(url)) return;

  /* NETWORK-FIRST para TUDO (navegação + JS/CSS/assets).
     Online: sempre busca a versão nova na rede e atualiza o cache — corrige o
     bug do "não atualiza" (o ignoreSearch antigo servia o ?v= velho do cache).
     Offline: cai no cache (exato; e por último ignorando o ?v= como salva-vidas). */
  e.respondWith((async function () {
    try {
      var fresh = await fetch(req);
      if (fresh && (fresh.ok || fresh.type === 'opaque')) {
        var c = await caches.open(CACHE); c.put(req, fresh.clone());
      }
      return fresh;
    } catch (err) {
      var cached = (await caches.match(req)) || (await caches.match(req, { ignoreSearch: true }));
      if (cached) return cached;
      if (req.mode === 'navigate') {
        return (await caches.match('mobile.html', { ignoreSearch: true })) ||
               (await caches.match('index.html', { ignoreSearch: true })) || Response.error();
      }
      return Response.error();
    }
  })());
});
