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

function getCacheKey(config) {
    // Key = method + url + org (so different orgs don't share cache)
    return `${config.method}:${config.url}:${currentUser?.orgId || ''}`;
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
    if (config.method === 'get' && !config._skipCache) {
        const key = getCacheKey(config);
        const cached = _cache.get(key);
        if (cached && Date.now() < cached.expiresAt) {
            // Return cached response without hitting Firestore
            const cancelSource = axios.CancelToken.source();
            config.cancelToken = cancelSource.token;
            config._cachedResponse = { data: cached.data, status: 200, statusText: 'OK (cached)', headers: {}, config };
            cancelSource.cancel('__cache_hit__');
        }
    }

    // ── Write → bust related cache + bust on write methods ──────────────
    if (['post', 'patch', 'put', 'delete'].includes(config.method)) {
        // e.g. POST /vouchers → bust all GET /vouchers* entries
        const base = config.url.split('/').slice(0, 2).join('/');
        invalidateCache(base);
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
        const syntheticResp = {
            data: { _queued: true, queueId: op.queueId, message: 'Saved offline — will sync when reconnected' },
            status: 202, statusText: 'Queued Offline', headers: {}, config, _queued: true,
        };
        const cancelSource = axios.CancelToken.source();
        config.cancelToken = cancelSource.token;
        cancelSource.cancel('__offline_queued__');
        config._offlineResponse = syntheticResp;
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

        // Store successful GET responses in cache
        if (res.config?.method === 'get' && !res.config?._skipCache && Array.isArray(res.data) || (res.config?.method === 'get' && res.data)) {
            const key = getCacheKey(res.config);
            _cache.set(key, { data: res.data, expiresAt: Date.now() + CACHE_TTL_MS });
        }

        return res;
    },
    (error) => {
        pendingRequests = Math.max(0, pendingRequests - 1);
        emitLoading();
        if (pendingRequests === 0) { clearTimeout(slowRequestTimer); window.dispatchEvent(new CustomEvent('api-fast')); }

        // Serve cache hit as success
        if (axios.isCancel(error) && error.message === '__cache_hit__') {
            return Promise.resolve(error.config._cachedResponse);
        }

        // Resolve offline-queued requests
        if (axios.isCancel(error) && error.message === '__offline_queued__') {
            return Promise.resolve(error.config._offlineResponse);
        }

        return Promise.reject(error);
    }
);

export default ax;
