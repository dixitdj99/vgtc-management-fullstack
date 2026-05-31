// VGTC Service Worker — Offline-first PWA support
const STATIC_CACHE = 'vgtc-static-v1';
const API_CACHE    = 'vgtc-api-v1';
const FONT_CACHE   = 'vgtc-fonts-v1';

// ── Install: cache the app shell immediately ───────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache =>
      cache.addAll(['/', '/index.html', '/manifest.json', '/favicon.svg', '/vgtc-logo.svg'])
    )
  );
  self.skipWaiting();
});

// ── Activate: purge old cache versions ────────────────────────────────────
self.addEventListener('activate', (event) => {
  const valid = new Set([STATIC_CACHE, API_CACHE, FONT_CACHE]);
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => !valid.has(k)).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── Fetch: route by request type ─────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle GET
  if (request.method !== 'GET') return;

  // Google Fonts — CacheFirst (long-lived)
  if (url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com') {
    event.respondWith(cacheFirst(FONT_CACHE, request));
    return;
  }

  // API calls — NetworkFirst with cached fallback
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/.netlify/functions/')) {
    event.respondWith(networkFirst(API_CACHE, request));
    return;
  }

  // Everything else (app shell, assets) — StaleWhileRevalidate
  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(STATIC_CACHE, request));
  }
});

// ── Strategy helpers ──────────────────────────────────────────────────────

async function networkFirst(cacheName, request) {
  const cache = await caches.open(cacheName);
  try {
    const fresh = await fetch(request.clone());
    if (fresh.ok) {
      cache.put(request, fresh.clone()); // background cache update
    }
    return fresh;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    // Return an offline JSON response so the UI can handle it gracefully
    return new Response(
      JSON.stringify({ error: 'You are offline. Showing cached data is not available for this request.', offline: true }),
      { status: 503, headers: { 'Content-Type': 'application/json', 'X-VGTC-Offline': '1' } }
    );
  }
}

async function staleWhileRevalidate(cacheName, request) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  // Always kick off a background revalidation
  const fetchPromise = fetch(request.clone()).then(fresh => {
    if (fresh.ok) cache.put(request, fresh.clone());
    return fresh;
  }).catch(() => null);
  return cached ?? (await fetchPromise) ?? new Response('Offline', { status: 503 });
}

async function cacheFirst(cacheName, request) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const fresh = await fetch(request.clone());
  if (fresh.ok) cache.put(request, fresh.clone());
  return fresh;
}
