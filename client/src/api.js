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

    // ── Offline write queue ───────────────────────────────────────────────
    const isWrite = ['post', 'patch', 'put', 'delete'].includes(config.method);
    if (isWrite && !navigator.onLine) {
        const label = `${config.method.toUpperCase()} ${config.url}`;
        const op = await enqueue({
            method:  config.method,
            url:     config.url,
            data:    config.data || null,
            headers: { Authorization: ax.defaults.headers.common['Authorization'], 'x-org-id': currentUser?.orgId },
            label,
        });
        // Notify UI about queue size
        const n = await count();
        window.dispatchEvent(new CustomEvent('offline-queue-changed', { detail: { count: n } }));
        // Return a synthetic "queued" response — component code treats it as success
        const syntheticResp = {
            data: { _queued: true, queueId: op.queueId, message: 'Saved offline — will sync when reconnected' },
            status: 202,
            statusText: 'Queued Offline',
            headers: {},
            config,
            _queued: true,
        };
        // Abort the real request and resolve with synthetic response
        const cancelSource = axios.CancelToken.source();
        config.cancelToken = cancelSource.token;
        cancelSource.cancel('__offline_queued__');
        // Store the synthetic response on the config for the response error handler
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
        return res;
    },
    (error) => {
        pendingRequests = Math.max(0, pendingRequests - 1);
        emitLoading();
        if (pendingRequests === 0) { clearTimeout(slowRequestTimer); window.dispatchEvent(new CustomEvent('api-fast')); }

        // Resolve cancelled offline-queued requests with the synthetic response
        if (axios.isCancel(error) && error.message === '__offline_queued__') {
            return Promise.resolve(error.config._offlineResponse);
        }

        return Promise.reject(error);
    }
);

export default ax;
