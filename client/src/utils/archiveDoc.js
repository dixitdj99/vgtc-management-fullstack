/**
 * archiveDoc — files a copy of what was just printed into Google Drive.
 *
 * The archive stores the *same HTML the print window used*, not a redrawn
 * version. The server used to keep a second copy of every layout in pdfkit, and
 * it had already drifted: the JK Laxmi slip and the voucher's rate and extra
 * payment lines were changed in the print and never reached the Drive copy. One
 * document, one renderer.
 *
 * Everything here is best-effort. A driver waiting at the gate must get his
 * slip whether or not Drive is reachable, so failures are logged and dropped.
 */

import ax from '../api';

/**
 * @param {object} doc
 * @param {string} doc.module  top folder — 'Loading Receipts', 'Vouchers', …
 * @param {string} doc.kind    subfolder — 'Documents', 'Statements', 'Exports'
 * @param {string} doc.name    file name without extension; reprinting the same
 *                             name replaces the file rather than adding another
 * @param {string} doc.html    exactly what the print window was given
 * @param {string} [doc.plant] plant/godown subfolder, where one applies
 * @param {object} [doc.meta]  anything worth recording alongside it
 * @returns {Promise<{archived: boolean}>} never rejects
 */
export async function archiveDoc({ module, kind, name, html, plant, meta }) {
    if (!module || !name || !html) return { archived: false };
    try {
        const { data } = await ax.post('/archive', { module, kind, name, html, plant, meta });
        return data || { archived: false };
    } catch (err) {
        // Deliberately quiet: this is a background copy, not the user's task.
        console.warn('[Archive] Could not file the document:', err.response?.data?.error || err.message);
        return { archived: false };
    }
}

/** A filename that is safe on Drive and stable across reprints of one document. */
export const archiveName = (...parts) =>
    parts
        .filter(p => p !== null && p !== undefined && String(p).trim() !== '')
        .join('_')
        .replace(/[\\/:*?"<>|]+/g, '-')
        .replace(/\s+/g, ' ')
        .slice(0, 120);
