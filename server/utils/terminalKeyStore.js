/**
 * terminalKeyStore.js — Centralized storage & verification for Terminal API Keys.
 * 
 * Supports both static default key and dynamically generated keys stored in
 * Firestore ('system_settings' / 'dev_system_settings') or localStore.
 * Keeps an in-memory cache for zero-latency authentication on high-frequency terminal polls.
 */

const { isAvailable, db } = require('../firebase');
const { getEnvCol } = require('./collectionUtils');
const localStore = require('./localStore');

const DEFAULT_KEY = process.env.TERMINAL_KEY || 'VGTC-TERMINAL-TOKEN-KEY';

let cachedTerminalKey = null;
let lastCacheTime = 0;
const CACHE_TTL_MS = 60 * 1000; // 1 minute TTL before re-checking persistence

/**
 * Retrieve the active terminal key from cache, Firestore, localStore, or env fallback.
 */
async function getTerminalKey() {
    const now = Date.now();
    if (cachedTerminalKey && (now - lastCacheTime) < CACHE_TTL_MS) {
        return cachedTerminalKey;
    }

    try {
        if (isAvailable() && db) {
            // Check environment-specific settings first (e.g. dev_system_settings)
            const envCol = getEnvCol('system_settings');
            let doc = await db.collection(envCol).doc('terminal_config').get();
            if (doc.exists && doc.data()?.terminalKey) {
                cachedTerminalKey = doc.data().terminalKey;
                lastCacheTime = now;
                return cachedTerminalKey;
            }

            // Fallback to base collection
            if (envCol !== 'system_settings') {
                doc = await db.collection('system_settings').doc('terminal_config').get();
                if (doc.exists && doc.data()?.terminalKey) {
                    cachedTerminalKey = doc.data().terminalKey;
                    lastCacheTime = now;
                    return cachedTerminalKey;
                }
            }
        }
    } catch (err) {
        console.warn('[TerminalKeyStore] Firestore lookup error:', err.message);
    }

    // Check localStore fallback
    try {
        const local = localStore.getById('system_settings', 'terminal_config');
        if (local?.terminalKey) {
            cachedTerminalKey = local.terminalKey;
            lastCacheTime = now;
            return cachedTerminalKey;
        }
    } catch (_) {}

    cachedTerminalKey = DEFAULT_KEY;
    lastCacheTime = now;
    return cachedTerminalKey;
}

/**
 * Persist a newly generated or updated terminal key across all available stores.
 */
async function setTerminalKey(newKey, user) {
    if (!newKey) throw new Error('Terminal key cannot be empty');
    cachedTerminalKey = newKey;
    lastCacheTime = Date.now();

    const data = {
        id: 'terminal_config',
        terminalKey: newKey,
        updatedAt: new Date().toISOString(),
        updatedBy: user?.name || user?.username || 'Admin'
    };

    // 1. Save to localStore (always keep a local copy)
    try {
        localStore.save('system_settings', data);
    } catch (err) {
        console.warn('[TerminalKeyStore] localStore save warning:', err.message);
    }

    // 2. Save to Firestore if available
    if (isAvailable() && db) {
        try {
            const envCol = getEnvCol('system_settings');
            await db.collection(envCol).doc('terminal_config').set(data, { merge: true });
            if (envCol !== 'system_settings') {
                await db.collection('system_settings').doc('terminal_config').set(data, { merge: true });
            }
        } catch (err) {
            console.error('[TerminalKeyStore] Firestore save error:', err);
            throw err;
        }
    }

    return newKey;
}

/**
 * Fast synchronous check for common keys or current in-memory cache.
 */
function isTerminalTokenFast(token) {
    if (!token || typeof token !== 'string') return false;
    const t = token.trim();
    const envKey = process.env.TERMINAL_KEY;
    if (envKey) {
        if (t === envKey) return true;
    } else {
        if (t === 'VGTC-TERMINAL-TOKEN-KEY') return true;
    }
    if (cachedTerminalKey && t === cachedTerminalKey) return true;
    return false;
}

/**
 * Robust async validation that queries storage if the fast check fails.
 */
async function isTerminalTokenAsync(token) {
    if (isTerminalTokenFast(token)) return true;
    const activeKey = await getTerminalKey();
    if (activeKey && token && token.trim() === activeKey) return true;
    return false;
}

module.exports = {
    DEFAULT_KEY,
    getTerminalKey,
    setTerminalKey,
    isTerminalTokenFast,
    isTerminalTokenAsync
};
