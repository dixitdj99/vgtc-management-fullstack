/**
 * listBackupService — a weekly copy of every list in the app, on Drive.
 *
 * The old weekly backup covered sales, LRs and vouchers for two plants. Stock,
 * challans, the cashbook, sell movements, invoices, vehicles, tyres and the
 * staff roster were not archived anywhere, so a Firestore accident would have
 * taken them with no paper trail.
 *
 * Two rules, both learned from the exports this replaces:
 *
 *  - **Every column.** Rows are built from the union of keys across the records
 *    rather than a curated list, because a curated list is exactly how the
 *    client exports were quietly dropping commission, tyre and extra-money
 *    fields. A field present on one record survives for all of them.
 *
 *  - **Excel is the copy that matters.** A forty-column list makes a poor PDF
 *    however it is set. The PDF is filed for the auditor who wants paper; the
 *    spreadsheet is what anyone would actually work from.
 */

const XLSX = require('xlsx');
const PDFDocument = require('pdfkit');
const driveService = require('./driveService');
const { db, isAvailable } = require('../firebase');
const { getEnvCol } = require('./collectionUtils');

/**
 * Every list worth keeping, and the folder it belongs under. `collection` is the
 * unprefixed name — getEnvCol applies dev_/beta_ so a test run cannot overwrite
 * production's backup.
 */
const LISTS = [
    { module: 'Vouchers', label: 'Vouchers', collection: 'vouchers' },
    { module: 'Loading Receipts', label: 'Loading Receipts (JK Super)', collection: 'loading_receipts' },
    { module: 'Loading Receipts', label: 'Loading Receipts (JK Lakshmi)', collection: 'jkl_loading_receipts' },
    { module: 'Balance Sheet', label: 'Freight Batches', collection: 'freight_batches' },
    { module: 'Stock', label: 'Stock Additions', collection: 'stock_additions' },
    { module: 'Stock', label: 'Challans', collection: 'challans' },
    { module: 'Stock', label: 'Set Bags', collection: 'set_stock' },
    { module: 'Cashbook', label: 'Cashbook (JK Super)', collection: 'cashbook_entries' },
    { module: 'Cashbook', label: 'Cashbook (JK Lakshmi)', collection: 'jkl_cashbook_entries' },
    { module: 'Sell', label: 'Sales', collection: 'sales' },
    { module: 'Invoices', label: 'Invoices', collection: 'invoices' },
    { module: 'Fleet', label: 'Vehicles', collection: 'vehicles' },
    { module: 'Fleet', label: 'Tyres', collection: 'tyres' },
    { module: 'Fleet', label: 'Maintenance', collection: 'maintenance' },
    { module: 'Pay', label: 'Payments', collection: 'payments' },
    { module: 'Pay', label: 'Vehicle Advances', collection: 'vehicle_advances' },
    { module: 'Other', label: 'Profiles', collection: 'profiles' },
    { module: 'Other', label: 'Attendance', collection: 'attendance' },
];

const OMIT = new Set(['orgId']);

const titleCase = (key) => String(key)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim();

/** Nested values flattened the same way the client export does. */
function flatten(val) {
    if (val === null || val === undefined) return '';
    if (Array.isArray(val)) return val.map(flatten).filter(Boolean).join(' | ');
    if (typeof val === 'object') {
        // Firestore timestamps arrive as { _seconds, _nanoseconds }.
        if (typeof val._seconds === 'number') return new Date(val._seconds * 1000).toISOString();
        return Object.entries(val)
            .filter(([, v]) => v !== null && v !== undefined && v !== '' && typeof v !== 'object')
            .map(([k, v]) => `${titleCase(k)}: ${v}`)
            .join(', ');
    }
    if (typeof val === 'boolean') return val ? 'Yes' : 'No';
    return val;
}

/**
 * Records to rows, keeping every field any of them carries.
 * Exported for the tests — this is the "no details miss" promise.
 */
function toRows(records) {
    const list = Array.isArray(records) ? records : [];
    if (!list.length) return { headers: [], rows: [] };

    const keys = new Set();
    list.forEach(r => Object.keys(r || {}).forEach(k => { if (!OMIT.has(k)) keys.add(k); }));
    const headers = [...keys].sort();

    return {
        headers: headers.map(titleCase),
        rows: list.map(r => headers.map(k => flatten(r?.[k]))),
    };
}

const xlsxBuffer = (headers, rows) => {
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    ws['!cols'] = headers.map((h, i) => ({
        wch: Math.min(40, Math.max(10, String(h).length + 2,
            ...rows.slice(0, 200).map(r => String(r[i] ?? '').length + 2))),
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Data');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
};

/** Landscape, small type, and honest about being cramped when the list is wide. */
function pdfBuffer(title, headers, rows) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ margin: 18, size: 'A4', layout: 'landscape' });
        const chunks = [];
        doc.on('data', c => chunks.push(c));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        const pageW = 841.89 - 36;
        const colW = pageW / Math.max(1, headers.length);
        const size = headers.length > 22 ? 4.5 : headers.length > 14 ? 5.5 : headers.length > 8 ? 7 : 8;

        doc.fontSize(12).font('Helvetica-Bold').text(title);
        doc.fontSize(7).font('Helvetica').fillColor('#666')
            .text(`${rows.length} rows · ${headers.length} columns · ${new Date().toLocaleString('en-IN')}`);
        doc.moveDown(0.5).fillColor('#000');

        const line = (cells, bold) => {
            if (doc.y > 545) doc.addPage({ margin: 18, size: 'A4', layout: 'landscape' });
            const y = doc.y;
            doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(size);
            cells.forEach((c, i) => {
                doc.text(String(c ?? '').slice(0, 60), 18 + i * colW, y, {
                    width: colW - 2, height: 9, ellipsis: true, lineBreak: false,
                });
            });
            doc.y = y + 9;
        };

        line(headers, true);
        rows.forEach(r => line(r));
        doc.end();
    });
}

/** YYYY-Www, so a week's files sit together and sort chronologically. */
function isoWeek(d = new Date()) {
    const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    const week = Math.ceil(((t - yearStart) / 86400000 + 1) / 7);
    return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/**
 * @param {string} orgId
 * @returns {Promise<object>} counts for the job log
 */
async function backupAllLists(orgId) {
    if (!isAvailable()) return { skipped: true, reason: 'Firestore is not available' };
    if (!(await driveService.isAuthorized().catch(() => false))) {
        return { skipped: true, reason: 'Google Drive is not connected' };
    }

    const week = isoWeek();
    const done = [];
    const empty = [];
    const errors = [];

    for (const list of LISTS) {
        try {
            const snap = await db.collection(getEnvCol(list.collection))
                .where('orgId', '==', orgId).get();
            const records = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            if (!records.length) { empty.push(list.label); continue; }

            const { headers, rows } = toRows(records);
            const folderId = await driveService.ensurePath([list.module, 'Weekly Lists', week]);
            const base = list.label.replace(/[\\/:*?"<>|]+/g, '-');

            await driveService.upsertBuffer(xlsxBuffer(headers, rows), `${base}.xlsx`, folderId,
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            await driveService.upsertBuffer(await pdfBuffer(list.label, headers, rows), `${base}.pdf`, folderId,
                'application/pdf');

            done.push({ list: list.label, rows: rows.length, columns: headers.length });
        } catch (err) {
            // One bad collection must not cost the other seventeen.
            errors.push(`${list.label}: ${err.message}`);
        }
    }

    await driveService.logActivity('Weekly_Lists', errors.length ? 'error' : 'success',
        `${done.length} lists filed for ${week}${empty.length ? `, ${empty.length} empty` : ''}`,
        errors.length ? new Error(errors.slice(0, 3).join(' | ')) : null);

    return { week, filed: done.length, lists: done, empty, errors };
}

module.exports = { backupAllLists, toRows, isoWeek, LISTS };
