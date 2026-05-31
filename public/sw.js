// sw.js — Service worker mínimo para la PWA Clawbot.
// Estrategia: cachea SOLO el "app shell" (navegación) con network-first, para nunca servir DATOS viejos.
// Los datos en vivo (Supabase Realtime/SWR, /api/*) NUNCA se cachean.
const CACHE = 'clawbot-shell-v1';
const SHELL = ['/', '/admin', '/escuela', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Nunca cachear datos en vivo ni terceros (Supabase, APIs).
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  // Solo el shell de navegación (documentos HTML): network-first con fallback a caché offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((m) => m || caches.match('/'))),
    );
    return;
  }

  // Estáticos propios (iconos, _next): cache-first (son inmutables / versionados).
  if (url.pathname.startsWith('/icons/') || url.pathname.startsWith('/_next/')) {
    event.respondWith(
      caches.match(req).then((m) =>
        m ||
        fetch(req).then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        }),
      ),
    );
  }
});
