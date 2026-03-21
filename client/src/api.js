import axios from 'axios';

// On Netlify, we use the direct function path to avoid redirect issues.
// Locally, we use /api which is proxied by Vite.
const API_BASE = '/api';

const ax = axios.create({
    baseURL: API_BASE,
    headers: {
        'Content-Type': 'application/json'
    }
});

// Sync token with local storage and axios defaults
export const setAuthToken = (token) => {
    if (token) {
        ax.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    } else {
        delete ax.defaults.headers.common['Authorization'];
    }
};

let currentUser = null;
export const setCurrentUser = (user) => {
    currentUser = user;
};

let pendingRequests = 0;
let slowRequestTimer = null;

ax.interceptors.request.use(config => {
    if (currentUser && (config.method === 'post' || config.method === 'patch' || config.method === 'put')) {
        if (config.data && typeof config.data === 'object' && !(config.data instanceof FormData)) {
            const userName = currentUser.name || currentUser.username || 'System';
            if (config.method === 'post' && !config.data.createdBy) {
                config.data.createdBy = userName;
            }
            config.data.updatedBy = userName;
        }
    }

    pendingRequests++;
    if (pendingRequests === 1) {
        slowRequestTimer = setTimeout(() => {
            window.dispatchEvent(new CustomEvent('api-slow'));
        }, 3000); // 3 seconds threshold for cold start Warning
    }

    return config;
}, error => {
    pendingRequests = Math.max(0, pendingRequests - 1);
    if (pendingRequests === 0) {
        clearTimeout(slowRequestTimer);
        window.dispatchEvent(new CustomEvent('api-fast'));
    }
    return Promise.reject(error);
});

ax.interceptors.response.use(res => {
    pendingRequests = Math.max(0, pendingRequests - 1);
    if (pendingRequests === 0) {
        clearTimeout(slowRequestTimer);
        window.dispatchEvent(new CustomEvent('api-fast'));
    }
    return res;
}, error => {
    pendingRequests = Math.max(0, pendingRequests - 1);
    if (pendingRequests === 0) {
        clearTimeout(slowRequestTimer);
        window.dispatchEvent(new CustomEvent('api-fast'));
    }
    return Promise.reject(error);
});

export default ax;
