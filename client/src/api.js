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

export default ax;
