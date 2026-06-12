/**
 * Sticky form defaults — remembers last-used values (date, type, tab) per module
 * across saves and reloads. Plain functions so they can be used inside
 * useState initializers with zero re-render cost.
 *
 * Keys in use: lr.date, voucher.date, voucher.type, cashbook.date
 */
const PREFIX = 'vgtc.sticky.';

export function getSticky(key, fallback) {
    try {
        const v = localStorage.getItem(PREFIX + key);
        return v !== null ? v : fallback;
    } catch {
        return fallback;
    }
}

export function rememberSticky(key, value) {
    try {
        if (value === undefined || value === null || value === '') return;
        localStorage.setItem(PREFIX + key, String(value));
    } catch { /* storage full/blocked — sticky is best-effort */ }
}
