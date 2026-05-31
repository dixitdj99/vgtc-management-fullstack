// VGTC Service Worker — Offline-first PWA
const STATIC_CACHE = 'vgtc-static-v2';
const API_CACHE    = 'vgtc-api-v2';
const FONT_CACHE   = 'vgtc-fonts-v1';

// Critical API endpoints to pre-fetch when online (app shell data)
const PREFETCH_URLS = [
  '/api/vouchers',
  '/api/lr',
  '/api/vehicles',
  '/api/parties',
  '/api/cashbook',
  '/api/profiles',
];

// ── Install ───────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache =>
      cache.addAll(['/', '/index.html', '/manifest.json', '/favicon.svg', '/vgtc-logo.svg'])
        .catch(() => {}) // Don't fail install if some assets are missing
    )
  );
  self.skipWaiting();
});

// ── Activate: purge stale caches ─────────────────────────────────────────
self.addEventListener('activate', (event) => {
  const valid = new Set([STATIC_CACHE, API_CACHE, FONT_CACHE]);
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => !valid.has(k)).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: routing ────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') return; // Only cache GETs

  // Google Fonts → CacheFirst
  if (url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com') {
    event.respondWith(cacheFirst(FONT_CACHE, request));
    return;
  }

  // API calls → NetworkFirst with offline fallback
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/.netlify/functions/')) {
    event.respondWith(networkFirst(API_CACHE, request));
    return;
  }

  // App shell & static assets → StaleWhileRevalidate
  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(STATIC_CACHE, request));
  }
});

// ── Message: handle pre-fetch trigger from page ───────────────────────────
self.addEventListener('message', (event) => {
  if (event.data?.type === 'PREFETCH_API') {
    const authHeader = event.data.authHeader;
    prefetchCriticalData(authHeader);
  }
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

async function prefetchCriticalData(authHeader) {
  if (!authHeader) return;
  const cache = await caches.open(API_CACHE);
  const headers = { 'Authorization': authHeader, 'Content-Type': 'application/json' };
  const orgId = self._orgId;

  await Promise.allSettled(
    PREFETCH_URLS.map(async (path) => {
      try {
        const req = new Request(path, { headers });
        const res = await fetch(req);
        if (res.ok) await cache.put(req, res);
      } catch {} // Silently ignore — prefetch is best-effort
    })
  );

  // Notify all clients that pre-fetch is done
  const clients = await self.clients.matchAll({ type: 'window' });
  clients.forEach(c => c.postMessage({ type: 'PREFETCH_DONE' }));
}

// ── Cache strategies ──────────────────────────────────────────────────────

async function networkFirst(cacheName, request) {
  const cache = await caches.open(cacheName);
  try {
    const fresh = await fetch(request.clone());
    if (fresh.ok) cache.put(request, fresh.clone());
    return fresh;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    return new Response(
      JSON.stringify({ error: 'Offline — no cached data available', offline: true }),
      { status: 503, headers: { 'Content-Type': 'application/json', 'X-VGTC-Offline': '1' } }
    );
  }
}

async function staleWhileRevalidate(cacheName, request) {
  const cache  = await caches.open(cacheName);
  const cached = await cache.match(request);
  const fresh  = fetch(request.clone())
    .then(res => { if (res.ok) cache.put(request, res.clone()); return res; })
    .catch(() => null);
  return cached || (await fresh) || new Response('Offline', { status: 503 });
}

async function cacheFirst(cacheName, request) {
  const cache  = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const fresh = await fetch(request.clone());
  if (fresh.ok) cache.put(request, fresh.clone());
  return fresh;
}
