/**
 * archiveService — files printed and exported documents into Google Drive.
 *
 * The document is stored as the exact HTML the print window used. The
 * alternative was a server-side redraw, which is what pdfService.js does and
 * which had already drifted from the paper: the JK Laxmi slip and the voucher's
 * rate and extra-payment lines were changed in the print and never reached
 * Drive. One document with two renderers diverges on every change; storing the
 * markup means the archive follows the app automatically.
 *
 * Nothing here throws at the caller. An archive that fails must never be the
 * reason a driver does not get his slip.
 */

const driveService = require('./driveService');
const { backupCustomDocument } = require('./realtimeBackup');
const backupPathUtils = require('./backupPathUtils');

/** Top-level folders. Anything not listed is filed under Other. */
const MODULES = new Set([
    'Loading Receipts', 'Vouchers', 'Balance Sheet', 'Stock', 'Cashbook',
    'Sell', 'Invoices', 'Fleet', 'Pay', 'Profit & Loss', 'Other',
]);

/** Subfolders within a module. */
const KINDS = new Set(['Documents', 'Statements', 'Exports', 'Weekly Lists']);

const MAX_HTML_BYTES = 4 * 1024 * 1024;

const safeName = backupPathUtils.safeName;
const monthOf = backupPathUtils.formatMonthFolder;

/**
 * The canonical folder path segments below VGTC_Backups.
 */
function folderPath({ module, kind = 'Documents', plant, when = new Date() }) {
    return backupPathUtils.resolveBackupFolderSegments({
        module,
        plant,
        date: when,
    });
}

/**
 * Archives a document to Google Drive in professional PDF format.
 * 
 * @param {object} doc module, kind, name, html, plant, meta
 * @returns {Promise<{archived: boolean, reason?: string, id?: string, replaced?: boolean}>}
 */
async function archive({ module, kind, name, html, plant, meta }) {
    if (!name && !html) return { archived: false, reason: 'name or html is required' };
    if (html && Buffer.byteLength(html, 'utf8') > MAX_HTML_BYTES) {
        return { archived: false, reason: 'document is too large to archive' };
    }

    return await backupCustomDocument({ module, kind, name, html, plant, meta });
}

module.exports = { archive, folderPath, safeName, monthOf, MODULES, KINDS, MAX_HTML_BYTES };

