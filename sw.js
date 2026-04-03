/* ============================================================
   ActivityFlow Service Worker  –  v1
   GitHub Pages base: /activityflow
   ============================================================ */

const CACHE_NAME = 'activityflow-v1';
const BASE       = '/activityflow';

const APP_SHELL = [
  `${BASE}/index.html`,
  `${BASE}/manifest.json`,
  `${BASE}/icons/icon-192.png`,
  `${BASE}/icons/icon-512.png`,
  `${BASE}/icons/icon-maskable-192.png`,
  `${BASE}/icons/icon-maskable-512.png`,
];

/* ── INSTALL: pre-cache app shell ───────────────────────────── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      Promise.allSettled(
        APP_SHELL.map(url =>
          cache.add(url).catch(err =>
            console.warn('[SW] Pre-cache miss:', url, err)
          )
        )
      )
    ).then(() => self.skipWaiting())
  );
});

/* ── ACTIVATE: remove old caches ────────────────────────────── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME)
          .map(k => {
            console.log('[SW] Deleting old cache:', k);
            return caches.delete(k);
          })
      )
    ).then(() => self.clients.claim())
  );
});

/* ── FETCH: three routing strategies ────────────────────────── */
self.addEventListener('fetch', event => {
  const { request } = event;

  // Skip non-GET
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // 1. Google Fonts → Stale-While-Revalidate
  if (
    url.hostname === 'fonts.googleapis.com' ||
    url.hostname === 'fonts.gstatic.com'
  ) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  // 2. Own origin + base path → Cache First
  if (
    url.origin === self.location.origin &&
    url.pathname.startsWith(BASE)
  ) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // 3. Everything else (CDNs, APIs) → Network First with cache fallback
  event.respondWith(networkFirst(request));
});

/* ── Strategy helpers ───────────────────────────────────────── */

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Return offline fallback if available
    return caches.match(`${BASE}/index.html`);
  }
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return caches.match(request);
  }
}

async function staleWhileRevalidate(request) {
  const cache  = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request).then(response => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => {});
  return cached || fetchPromise;
}

/* ── Message handler ────────────────────────────────────────── */
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data?.type === 'CLEAR_CACHE') {
    caches.delete(CACHE_NAME).then(() =>
      console.log('[SW] Cache cleared')
    );
  }
});
