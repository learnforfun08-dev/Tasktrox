/* ============================================================
   Tasktrox Service Worker  —  sw.js
   Cache version: tasktrox-v1
   Repo base:     /Tasktrox
   ============================================================ */

const CACHE_NAME   = 'tasktrox-v1';
const BASE         = '/Tasktrox';

/* All files that make up the app shell */
const APP_SHELL = [
  `${BASE}/index.html`,
  `${BASE}/manifest.json`,
  `${BASE}/icons/icon-192.png`,
  `${BASE}/icons/icon-512.png`,
  `${BASE}/icons/icon-maskable-192.png`,
  `${BASE}/icons/icon-maskable-512.png`,
];

/* ── INSTALL ──────────────────────────────────────────────── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // allSettled: one 404 won't break the whole install
      return Promise.allSettled(
        APP_SHELL.map(url =>
          cache.add(url).catch(err =>
            console.warn(`[SW] Failed to cache ${url}:`, err)
          )
        )
      );
    }).then(() => self.skipWaiting())
  );
});

/* ── ACTIVATE ─────────────────────────────────────────────── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => {
            console.log(`[SW] Deleting old cache: ${key}`);
            return caches.delete(key);
          })
      )
    ).then(() => self.clients.claim())
  );
});

/* ── FETCH ────────────────────────────────────────────────── */
self.addEventListener('fetch', event => {
  const { request } = event;

  // Skip non-GET
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  /* 1. Google Fonts → Stale-While-Revalidate */
  if (
    url.hostname === 'fonts.googleapis.com' ||
    url.hostname === 'fonts.gstatic.com'
  ) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  /* 2. Own origin + base path → Cache First */
  if (
    url.origin === self.location.origin &&
    url.pathname.startsWith(BASE)
  ) {
    event.respondWith(cacheFirst(request));
    return;
  }

  /* 3. Everything else (CDN scripts, avatars, etc.) → Network First */
  event.respondWith(networkFirst(request));
});

/* ── STRATEGIES ───────────────────────────────────────────── */

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
    const cached = await caches.match(request);
    return cached || new Response('Offline', { status: 503 });
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request).then(response => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => null);

  return cached || fetchPromise;
}

/* ── MESSAGE HANDLER ──────────────────────────────────────── */
self.addEventListener('message', event => {
  if (!event.data) return;

  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data.type === 'CLEAR_CACHE') {
    caches.delete(CACHE_NAME).then(() =>
      console.log('[SW] Cache cleared by client request')
    );
  }
});
