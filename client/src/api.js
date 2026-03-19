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

// Interceptor to attach createdBy and updatedBy for mutations
ax.interceptors.request.use(config => {
    if (currentUser && (config.method === 'post' || config.method === 'patch' || config.method === 'put')) {
        // Only attach if config.data is a plain object or array (skip FormData etc. if any)
        if (config.data && typeof config.data === 'object' && !(config.data instanceof FormData)) {
            const userName = currentUser.name || currentUser.username || 'System';
            
            // For POST requests, attach createdBy if it doesn't exist
            if (config.method === 'post' && !config.data.createdBy) {
                config.data.createdBy = userName;
            }
            // Always attach updatedBy for any mutation
            config.data.updatedBy = userName;
        }
    }
    return config;
}, error => {
    return Promise.reject(error);
});

export default ax;
