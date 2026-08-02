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

/** Top-level folders. Anything not listed is filed under Other. */
const MODULES = new Set([
    'Loading Receipts', 'Vouchers', 'Balance Sheet', 'Stock', 'Cashbook',
    'Sell', 'Invoices', 'Fleet', 'Pay', 'Profit & Loss', 'Other',
]);

/** Subfolders within a module. */
const KINDS = new Set(['Documents', 'Statements', 'Exports', 'Weekly Lists']);

const MAX_HTML_BYTES = 2 * 1024 * 1024;

/** Drive rejects these outright, and a slash would silently nest a folder. */
const safeName = (s) => String(s || '')
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);

/** YYYY-MM, the folder a document is filed under. */
const monthOf = (d = new Date()) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

/**
 * The folder a document belongs in.
 * Exported so the tests can assert the tree without touching Drive.
 * @returns {string[]} path segments below VGTC_Backups
 */
function folderPath({ module, kind = 'Documents', plant, when = new Date() }) {
    return [
        MODULES.has(module) ? module : 'Other',
        KINDS.has(kind) ? kind : 'Documents',
        plant ? safeName(plant) : null,
        monthOf(when),
    ].filter(Boolean);
}

/**
 * @param {object} doc module, kind, name, html, plant, meta
 * @returns {Promise<{archived: boolean, reason?: string, id?: string, replaced?: boolean}>}
 */
async function archive({ module, kind, name, html, plant, meta }) {
    if (!name || !html) return { archived: false, reason: 'name and html are required' };
    if (Buffer.byteLength(html, 'utf8') > MAX_HTML_BYTES) {
        return { archived: false, reason: 'document is too large to archive' };
    }

    // Unauthorized is the ordinary state until someone connects Drive, so it is
    // reported rather than raised — the caller carries on either way.
    if (!(await driveService.isAuthorized().catch(() => false))) {
        return { archived: false, reason: 'Google Drive is not connected' };
    }

    const folderId = await driveService.ensurePath(folderPath({ module, kind, plant }));
    const fileName = `${safeName(name)}.html`;
    const res = await driveService.upsertBuffer(
        Buffer.from(html, 'utf8'), fileName, folderId, 'text/html',
    );

    await driveService.logActivity(
        `Archive_${module || 'Other'}`, 'success',
        `${res.replaced ? 'Replaced' : 'Filed'} ${fileName}${meta?.lrNo ? ` (LR ${meta.lrNo})` : ''}`,
    );
    return { archived: true, id: res.id, replaced: res.replaced };
}

module.exports = { archive, folderPath, safeName, monthOf, MODULES, KINDS, MAX_HTML_BYTES };
