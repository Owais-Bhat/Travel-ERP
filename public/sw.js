// Minimal app-shell cache so the site is installable and survives a flaky
// connection. Deliberately network-first for navigation/API requests —
// this is a live multi-tenant app, stale cached data would be worse than
// no offline support at all. Only static built assets get cached.
const CACHE_NAME = 'cybermilo-shell-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const isStaticAsset = url.pathname.startsWith('/assets/');
  if (!isStaticAsset) return; // let everything else (API calls, navigations) hit the network normally

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
  );
});
