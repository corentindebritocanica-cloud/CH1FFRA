// Prisme — service worker : l'application entière est mise en cache à l'installation
// et fonctionne ensuite sans réseau. Chaque version a son propre cache.
const VERSION = 'prisme-1.0.0';
const ASSETS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'js/app.js',
  'js/core/kit.js',
  'js/core/gl.js',
  'js/modules/synth.js',
  'js/modules/fractal.js',
  'js/modules/vision.js',
  'js/modules/system.js',
  'js/modules/fluid.js',
  'js/modules/galaxy.js',
  'js/workers/bench.js',
  'fonts/unbounded.woff2',
  'fonts/jetbrains-mono.woff2',
  'icons/favicon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/maskable-512.png',
  'icons/apple-touch-icon.png',
  'icons/splash-1320x2868.png',
  'icons/splash-2868x1320.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await cache.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' })));
    // Première installation : prise de contrôle immédiate. Mise à jour : on attend l'accord de l'utilisateur.
    if (!self.registration.active) await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('prisme-') && k !== VERSION).map((k) => caches.delete(k)));
    if (self.registration.navigationPreload) await self.registration.navigationPreload.disable().catch(() => {});
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    // Coquille de l'application : réponse instantanée depuis le cache, réseau en secours.
    event.respondWith((async () => {
      const cache = await caches.open(VERSION);
      const cached = await cache.match('index.html');
      if (cached) return cached;
      try { return await fetch(req); } catch { return new Response('Hors-ligne', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }); }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(req, { ignoreSearch: true });
    if (cached) return cached;
    try {
      const res = await fetch(req);
      if (res.ok && res.type === 'basic') {
        const cache = await caches.open(VERSION);
        cache.put(req, res.clone());
      }
      return res;
    } catch {
      return new Response('', { status: 504 });
    }
  })());
});
