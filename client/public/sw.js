// VGTC Service Worker — Offline-first PWA
// v3: NetworkFirst for HTML to prevent stale-bundle white screens
const STATIC_CACHE = 'vgtc-static-v3';
const API_CACHE    = 'vgtc-api-v3';
const FONT_CACHE   = 'vgtc-fonts-v1';

// ── Install ───────────────────────────────────────────────────────────────
// Do NOT call skipWaiting here — we want the new SW to wait so the app
// can show an "Update available" banner and let the user choose when to reload.
self.addEventListener('install', (event) => {
  // SW waits in 'installed' state until page calls SKIP_WAITING
});

// ── Activate: purge stale caches ─────────────────────────────────────────
self.addEventListener('activate', (event) => {
  const valid = new Set([STATIC_CACHE, API_CACHE, FONT_CACHE]);
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => !valid.has(k)).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// ── Fetch: routing ────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;

  // Google Fonts → CacheFirst (long-lived)
  if (url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com') {
    event.respondWith(cacheFirst(FONT_CACHE, request));
    return;
  }

  // API calls → NetworkFirst with offline fallback
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/.netlify/functions/')) {
    event.respondWith(networkFirst(API_CACHE, request));
    return;
  }

  // HTML documents (index.html, /) → ALWAYS NetworkFirst
  // This prevents stale HTML loading old JS bundle hashes after a deploy.
  if (request.headers.get('Accept')?.includes('text/html') ||
      url.pathname === '/' || url.pathname.endsWith('.html')) {
    event.respondWith(networkFirstHTML(request));
    return;
  }

  // Vite-hashed static assets (JS, CSS) → CacheFirst (safe because hash changes on update)
  if (url.pathname.startsWith('/assets/') &&
      (url.pathname.endsWith('.js') || url.pathname.endsWith('.css'))) {
    event.respondWith(cacheFirst(STATIC_CACHE, request));
    return;
  }

  // Everything else (images, icons, manifest) → StaleWhileRevalidate
  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(STATIC_CACHE, request));
  }
});

// ── Message handler ───────────────────────────────────────────────────────
self.addEventListener('message', (event) => {
  if (event.data?.type === 'PREFETCH_API') {
    prefetchCriticalData(event.data.authHeader);
  }
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

async function prefetchCriticalData(authHeader) {
  if (!authHeader) return;
  const cache = await caches.open(API_CACHE);
  const PREFETCH_URLS = ['/api/vouchers', '/api/lr', '/api/vehicles', '/api/parties', '/api/cashbook', '/api/profiles'];
  await Promise.allSettled(
    PREFETCH_URLS.map(async (path) => {
      try {
        const req = new Request(path, { headers: { Authorization: authHeader, 'Content-Type': 'application/json' } });
        const res = await fetch(req);
        if (res.ok) await cache.put(req, res);
      } catch {}
    })
  );
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

async function networkFirstHTML(request) {
  // For HTML: always try network. Only fall back to cache on network failure.
  try {
    const fresh = await fetch(request.clone());
    if (fresh.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, fresh.clone());
    }
    return fresh;
  } catch {
    const cache = await caches.open(STATIC_CACHE);
    const cached = await cache.match(request);
    return cached || new Response('<h1>Offline</h1><p>No cached page available.</p>', {
      status: 503, headers: { 'Content-Type': 'text/html' }
    });
  }
}

async function cacheFirst(cacheName, request) {
  const cache  = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const fresh = await fetch(request.clone());
  if (fresh.ok) cache.put(request, fresh.clone());
  return fresh;
}

async function staleWhileRevalidate(cacheName, request) {
  const cache  = await caches.open(cacheName);
  const cached = await cache.match(request);
  const fresh  = fetch(request.clone())
    .then(res => { if (res.ok) cache.put(request, res.clone()); return res; })
    .catch(() => null);
  return cached || (await fresh) || new Response('Offline', { status: 503 });
}
