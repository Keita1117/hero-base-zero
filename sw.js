const CACHE_NAME = 'hero-base-zero-v1';

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
  './js/mech-svg.js',
  './js/app.js',
  './js/games/hiragana.js',
  './js/games/math-clock.js',
  './js/games/logic-robo.js',
  './js/games/english.js',
  './js/games/scanner.js',
  './js/games/studio.js',
  './js/games/habits-mech.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting())
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

  const networkPromise = fetch(request).then(async (response) => {
    if (response && response.ok && response.type === 'basic') {
      const copy = response.clone();
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, copy);
    }
    return response;
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
        return new Response('Offline', { status: 503, statusText: 'Offline' });
      });
    })
  );
});
