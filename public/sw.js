/*
 * A small service worker so the scene keeps working with no connection and
 * can be installed to a home screen.
 *
 * Navigations are network-first, so a fresh deploy is picked up as soon as the
 * device is online; everything else is cache-first, because Vite fingerprints
 * asset filenames and a given URL's contents never change. Bumping VERSION
 * drops the old cache wholesale.
 */
const VERSION = 'night-lanterns-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(VERSION).then((cache) =>
      cache.addAll(['/', '/manifest.webmanifest']).catch(() => {})
    )
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // HTML: try the network so a new deploy lands, fall back to the cache offline
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put('/', copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match('/', { ignoreSearch: true })
          .then((hit) => hit || Response.error()))
    );
    return;
  }

  // everything else: serve from cache, and populate it on first use
  event.respondWith(
    caches.match(request).then((hit) => hit || fetch(request).then((res) => {
      if (res.ok && res.type === 'basic') {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(request, copy)).catch(() => {});
      }
      return res;
    }))
  );
});
