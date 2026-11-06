// Raahi service worker: lets the app open with weak or no signal (Safar Saathi works offline).
// - Pages: network first, so you always get the latest when online; the cached copy when not.
// - Built files (/assets/*, hashed names): cache first; they never change.
// - Photos and icons: cached as you see them.
// - API calls are never cached here: the app keeps its own offline data and says when it is stale.
// - The app shell (the page and the scripts and styles it names) is stored at install, so the app
//   opens offline even on the first visit: the main bundle loads before this worker takes
//   control, so it would otherwise never pass through here. The page also sends the files it
//   loaded before that moment (see src/main.jsx).
const VERSION = 'raahi-sw-2';
const SHELL = ['/', '/spa'];

async function precacheShell() {
  const cache = await caches.open(VERSION);
  for (const path of SHELL) {
    try {
      const res = await fetch(path, { cache: 'no-cache' });
      if (!res.ok) continue;
      await cache.put(path, res.clone());
      const html = await res.text();
      const assets = [...new Set(html.match(/\/assets\/[^"'\s)]+\.(?:js|css)/g) || [])];
      await Promise.all(assets.map((a) => cache.match(a).then((hit) => hit || cache.add(a)).catch(() => undefined)));
    } catch {
      /* offline during install: the next visit will try again */
    }
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(precacheShell());
  self.skipWaiting();
});

// Files the page loaded before this worker controlled it (hashed, so safe to keep).
self.addEventListener('message', (event) => {
  const msg = event.data || {};
  if (msg.type !== 'cache' || !Array.isArray(msg.urls)) return;
  const own = msg.urls.filter((u) => {
    try {
      const url = new URL(u, self.location.origin);
      return url.origin === self.location.origin && url.pathname.startsWith('/assets/');
    } catch {
      return false;
    }
  }).slice(0, 80);
  event.waitUntil(caches.open(VERSION).then((c) => Promise.all(
    own.map((u) => c.match(u).then((hit) => hit || c.add(u)).catch(() => undefined)),
  )));
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
