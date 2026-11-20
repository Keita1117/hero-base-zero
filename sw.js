const CACHE_NAME = 'hero-base-zero-v3';

const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './js/dom.js',
  './js/data.js',
  './js/core.js',
  './js/storage.js',
  './js/sound.js',
  './js/voice.js',
  './js/fx.js',
  './js/mech-svg.js',
  './js/app.js',
  './js/games/monster-kana.js',
  './js/games/turbo-math.js',
  './js/games/robo-rescue.js',
  './js/games/hero-kitchen.js',
  './js/games/magic-studio.js',
  './js/games/habit-base.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => Promise.allSettled(PRECACHE_URLS.map((u) => cache.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), 5000) : null;

  const networkPromise = fetch(request, controller ? { signal: controller.signal } : undefined)
    .then(async (response) => {
      if (response && response.ok && response.type === 'basic') {
        const copy = response.clone();
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, copy);
      }
      return response;
    })
    .finally(() => {
      if (timer) clearTimeout(timer);
    });

  event.waitUntil(networkPromise.catch(() => {}));

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return networkPromise.catch(async () => {
        if (request.mode === 'navigate') {
          const shell = await caches.match('./index.html');
          if (shell) return shell;
        }
        return new Response('Offline', {
          status: 503,
          statusText: 'Offline',
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      });
    })
  );
});
