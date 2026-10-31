// Raahi service worker: lets the app open with weak or no signal (Safar Saathi works offline).
// - Pages: network first, so you always get the latest when online; the cached copy when not.
// - Built files (/assets/*, hashed names): cache first; they never change.
// - Photos and icons: cached as you see them.
// - API calls are never cached here: the app keeps its own offline data and says when it is stale.
const VERSION = 'raahi-sw-1';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(['/']).catch(() => undefined)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function store(request, response) {
  if (response && response.ok && response.type === 'basic') {
    const copy = response.clone();
    caches.open(VERSION).then((c) => c.put(request, copy));
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => store(request, res))
        .catch(async () => (await caches.match(request)) || (await caches.match('/spa'))
          || (await caches.match('/')) || Response.error()),
    );
    return;
  }
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(caches.match(request).then((hit) => hit || fetch(request).then((res) => store(request, res))));
    return;
  }
  if (url.pathname.startsWith('/images/') || url.pathname === '/favicon.svg') {
    event.respondWith(
      caches.match(request).then((hit) => {
        const fresh = fetch(request).then((res) => store(request, res)).catch(() => hit);
        return hit || fresh;
      }),
    );
  }
});
