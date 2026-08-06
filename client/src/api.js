import axios from 'axios';
import { enqueue, count } from './utils/offlineQueue';

const API_BASE = '/api';

const ax = axios.create({
    baseURL: API_BASE,
    headers: { 'Content-Type': 'application/json' }
});

export const setAuthToken = (token) => {
    if (token) ax.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    else delete ax.defaults.headers.common['Authorization'];
};

let currentUser = null;
export const setCurrentUser = (user) => { currentUser = user; };

// ── GET Response Cache (TTL: 3 minutes) ──────────────────────────────────────
// Dramatically reduces Firestore reads by serving repeated module mounts from cache.
const CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutes
const _cache = new Map(); // key → { data, expiresAt }

export function invalidateCache(urlPattern) {
    // Call after a write to bust related cached GETs
    // urlPattern: string prefix, e.g. '/vouchers' busts all voucher GETs
    for (const key of _cache.keys()) {
        if (key.includes(urlPattern)) _cache.delete(key);
    }
}

export function clearAllCache() {
    _cache.clear();
}

// Nothing else ever removes an expired entry, and keying on params means one
// screen can mint an entry per day stepped through. Sweep on write so the map
// tracks what is actually live rather than growing for the whole session.
function pruneExpired() {
    const now = Date.now();
    for (const [key, entry] of _cache) {
        if (now >= entry.expiresAt) _cache.delete(key);
    }
}

/**
 * Query params are part of the identity of a GET.
 *
 * They live in `config.params` at this point, not in `config.url` — axios only
 * serialises them onto the URL later. Keying on the url alone meant every
 * `?date=` shared one entry, so picking another day on the attendance roll-call
 * (and any other params-driven screen) replayed the first day's data for the
 * whole TTL. Keys are sorted so `{a,b}` and `{b,a}` stay the same entry.
 */
function serialiseParams(params) {
    if (!params) return '';
    if (params instanceof URLSearchParams) {
        const pairs = [...params.entries()].sort(([a], [b]) => a.localeCompare(b));
        return new URLSearchParams(pairs).toString();
    }
    const keys = Object.keys(params).filter(k => params[k] !== undefined).sort();
    if (!keys.length) return '';
    return keys.map(k => `${k}=${JSON.stringify(params[k])}`).join('&');
}

function getCacheKey(config) {
    // Key = method + url + params + org (so different orgs don't share cache)
    return `${config.method}:${config.url}?${serialiseParams(config.params)}:${currentUser?.orgId || ''}`;
}

let pendingRequests = 0;
let slowRequestTimer = null;

function emitLoading() {
    window.dispatchEvent(new CustomEvent('api-loading', { detail: { loading: pendingRequests > 0, count: pendingRequests } }));
}

// ── Request interceptor ───────────────────────────────────────────────────
ax.interceptors.request.use(async (config) => {
    // Inject org ID
    if (currentUser?.orgId) config.headers['x-org-id'] = currentUser.orgId;

    // Inject createdBy / updatedBy
    if (currentUser && ['post', 'patch', 'put'].includes(config.method)) {
        if (config.data && typeof config.data === 'object' && !(config.data instanceof FormData)) {
            const name = currentUser.name || currentUser.username || 'System';
            if (config.method === 'post' && !config.data.createdBy) config.data.createdBy = name;
            config.data.updatedBy = name;
        }
    }

    // ── GET Cache check ──────────────────────────────────────────────────
    // Serve fresh cache via a one-shot custom adapter (no request cancellation —
    // cancellation lost config across axios versions and crashed callers).
    if (config.method === 'get' && !config._skipCache) {
        const key = getCacheKey(config);
        const cached = _cache.get(key);
        if (cached && Date.now() < cached.expiresAt) {
            config.adapter = () => Promise.resolve({
                data: cached.data, status: 200, statusText: 'OK (cached)', headers: {}, config, request: {},
            });
        }
    }

    // ── Write → bust related cache + bust on write methods ──────────────
    if (['post', 'patch', 'put', 'delete'].includes(config.method)) {
        // e.g. POST /vouchers → bust all GET /vouchers* entries
        const base = config.url.split('/').slice(0, 2).join('/');
        invalidateCache(base);
        // Invoice generate/edit/delete also mark/unmark balance-sheet vouchers
        // server-side — a stale voucher cache would mis-filter the next upload.
        if (base === '/invoices') invalidateCache('/vouchers');
    }

    // ── Offline write queue ───────────────────────────────────────────────
    const isWrite = ['post', 'patch', 'put', 'delete'].includes(config.method);
    if (isWrite && !navigator.onLine) {
        const op = await enqueue({
            method:  config.method,
            url:     config.url,
            data:    config.data || null,
            headers: { Authorization: ax.defaults.headers.common['Authorization'], 'x-org-id': currentUser?.orgId },
            label:   `${config.method.toUpperCase()} ${config.url}`,
        });
        const n = await count();
        window.dispatchEvent(new CustomEvent('offline-queue-changed', { detail: { count: n } }));
        // Resolve via a one-shot adapter (same robustness as the cache path)
        config.adapter = () => Promise.resolve({
            data: { _queued: true, queueId: op.queueId, message: 'Saved offline — will sync when reconnected' },
            status: 202, statusText: 'Queued Offline', headers: {}, config, request: {}, _queued: true,
        });
    }

    // Loading indicators
    pendingRequests++;
    emitLoading();
    if (pendingRequests === 1) {
        slowRequestTimer = setTimeout(() => window.dispatchEvent(new CustomEvent('api-slow')), 3000);
    }

    return config;
}, (error) => {
    pendingRequests = Math.max(0, pendingRequests - 1);
    if (pendingRequests === 0) { clearTimeout(slowRequestTimer); window.dispatchEvent(new CustomEvent('api-fast')); }
    return Promise.reject(error);
});

// ── Response interceptor ──────────────────────────────────────────────────
ax.interceptors.response.use(
    (res) => {
        pendingRequests = Math.max(0, pendingRequests - 1);
        emitLoading();
        if (pendingRequests === 0) { clearTimeout(slowRequestTimer); window.dispatchEvent(new CustomEvent('api-fast')); }

        // Store successful GET responses in cache. `&&` binds tighter than `||`,
        // so the old two-branch condition let a `_skipCache` request write to the
        // cache anyway — opting out of reading it is not opting out of filling it.
        if (res.config?.method === 'get' && !res.config?._skipCache && res.data) {
            pruneExpired();
            _cache.set(getCacheKey(res.config), { data: res.data, expiresAt: Date.now() + CACHE_TTL_MS });
        }

        return res;
    },
    (error) => {
        pendingRequests = Math.max(0, pendingRequests - 1);
        emitLoading();
        if (pendingRequests === 0) { clearTimeout(slowRequestTimer); window.dispatchEvent(new CustomEvent('api-fast')); }

        return Promise.reject(error);
    }
);

export default ax;
