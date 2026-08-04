import * as XLSX from 'xlsx';
import { reportWatermarkCss } from './receiptPrint';

/**
 * exportUtils — getting a list out of the app without losing any of it.
 *
 * Both exports used to drop columns, from opposite ends. exportToPDF took a
 * hand-picked `columns` list and every caller passed a short one — the Balance
 * Sheet printed 14 of its ~25 fields. exportToExcel had no such list, but
 * callers built cut-down row objects before handing them over. Either way
 * nothing said anything was missing, so a filed export quietly wasn't the
 * record anyone thought it was.
 *
 * buildExportRows is the fix: give it the records and it keeps everything on
 * them, in a readable shape.
 */

/** Noise that belongs to storage, not to the business record. */
const DEFAULT_OMIT = ['id', 'orgId', 'createdAt', 'updatedAt', 'brand'];

const titleCase = (key) => key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim();

/**
 * Objects and arrays are the fields most worth keeping and the easiest to lose:
 * a voucher's deliveries, a challan's materials, a voucher's extra payments.
 * Dumped raw they read "[object Object]", so flatten them to something a person
 * can check against the screen.
 */
function flatten(val) {
    if (val === null || val === undefined) return '';
    if (Array.isArray(val)) return val.map(flatten).filter(Boolean).join(' | ');
    if (typeof val === 'object') {
        return Object.entries(val)
            .filter(([, v]) => v !== null && v !== undefined && v !== '' && typeof v !== 'object')
            .map(([k, v]) => `${titleCase(k)}: ${v}`)
            .join(', ');
    }
    if (typeof val === 'boolean') return val ? 'Yes' : 'No';
    return val;
}

/**
 * Every field on every record, plus whatever has to be computed.
 *
 * @param {Array<Object>} records the raw list, exactly as the module holds it
 * @param {Object}   [opts]
 * @param {Object}   [opts.computed] label -> (record) => value, for figures the
 *   record does not store (Gross, Net, Outstanding). Without these a raw dump
 *   is complete but useless — the numbers the sheet shows are derived.
 * @param {string[]} [opts.omit] extra keys to drop
 * @param {string[]} [opts.order] keys to place first; the rest follow, sorted
 * @returns {Array<Object>} rows keyed by human-readable labels
 */
export function buildExportRows(records, { computed = {}, omit = [], order = [] } = {}) {
    const list = Array.isArray(records) ? records : [];
    if (!list.length) return [];

    const skip = new Set([...DEFAULT_OMIT, ...omit]);

    // The union, not the first record's keys: a field that only some rows carry
    // — a bill number, an extra payment — would otherwise vanish from all of them.
    const keys = new Set();
    list.forEach(r => Object.keys(r || {}).forEach(k => {
        if (!skip.has(k) && !k.startsWith('_')) keys.add(k);
    }));

    const ordered = [
        ...order.filter(k => keys.has(k)),
        ...[...keys].filter(k => !order.includes(k)).sort(),
    ];

    return list.map(r => {
        const row = {};
        ordered.forEach(k => { row[titleCase(k)] = flatten(r?.[k]); });
        Object.entries(computed).forEach(([label, fn]) => {
            try { row[label] = fn(r); } catch { row[label] = ''; }
        });
        return row;
    });
}

/**
 * Downloads an array of objects as an Excel file.
 * @param {Array<Object>} rows the data to export — pass buildExportRows output
 * @param {String} filename output name, without .xlsx
 */
export const exportToExcel = (rows, filename = 'export') => {
    if (!rows || rows.length === 0) {
        alert('No data to export.');
        return;
    }
    const worksheet = XLSX.utils.json_to_sheet(rows);

    // Without this every column is the same default width and a date or a party
    // name is read as "####". Capped so one long remark cannot push the rest
    // off the screen.
    const headers = Object.keys(rows[0]);
    worksheet['!cols'] = headers.map(h => ({
        wch: Math.min(40, Math.max(10, h.length + 2,
            ...rows.slice(0, 200).map(r => String(r[h] ?? '').length + 2))),
    }));

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Data');
    XLSX.writeFile(workbook, `${filename}.xlsx`);
};

/**
 * Opens a print dialog with a styled HTML table of the provided data.
 *
 * @param {Array<Object>} rows the data to print
 * @param {String} title document title
 * @param {Array<String>} [columns] narrow the sheet deliberately. Omit it and
 *   every column is printed — which is the point: this parameter used to be how
 *   data went missing, because callers always passed a shortlist.
 * @param {Object} [opts]
 * @param {Object} [opts.archive] file a copy in Drive — see archiveDoc()
 * @param {Function} [opts.onHtml] receives the finished HTML
 */
export const exportToPDF = (rows, title = 'Document Export', columns = null, opts = {}) => {
    if (!rows || rows.length === 0) {
        alert('No data to print.');
        return;
    }

    // Union again, for the same reason as buildExportRows.
    let headers = columns;
    if (!headers) {
        const set = new Set();
        rows.forEach(r => Object.keys(r || {}).forEach(k => {
            if (k !== 'id' && !k.startsWith('_')) set.add(k);
        }));
        headers = [...set];
    }

    // A complete export is wide. Landscape it and shrink the type rather than
    // letting the browser clip columns off the right-hand edge.
    const wide = headers.length > 8;
    const fontSize = headers.length > 20 ? 7 : headers.length > 14 ? 8 : headers.length > 10 ? 9 : 11;

    const cell = (v) => (v === null || v === undefined ? '' : String(v));

    const html = `<!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <title>${title}</title>
        <style>
          @page { size: ${wide ? 'A4 landscape' : 'A4 portrait'}; margin: 10mm; }
          body { font-family: system-ui, -apple-system, sans-serif; color: #111827; padding: 16px; }
          h2 { margin: 0 0 4px; font-size: 16px; }
          .meta { font-size: 10px; color: #6b7280; margin-bottom: 12px; }
          table { width: 100%; border-collapse: collapse; font-size: ${fontSize}px; table-layout: auto; }
          th, td { border: 1px solid #d1d5db; padding: 3px 5px; text-align: left; vertical-align: top;
                   word-break: break-word; }
          th { background: #f3f4f6; font-weight: 700; white-space: nowrap; }
          tr:nth-child(even) td { background: #fafafa; }
          @media print { body { padding: 0; } button { display: none !important; } }
          ${reportWatermarkCss()}
        </style>
      </head>
      <body>
        <div style="display:flex;justify-content:space-between;align-items:flex-start;">
          <div>
            <h2>${title}</h2>
            <div class="meta">${rows.length} row${rows.length === 1 ? '' : 's'} ·
              ${headers.length} columns · printed ${new Date().toLocaleString('en-IN')}</div>
          </div>
          <button onclick="window.print()" style="padding:8px 16px;background:#6366f1;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:bold;">Print / Save PDF</button>
        </div>
        <table>
          <thead><tr>${headers.map(h => `<th>${cell(h)}</th>`).join('')}</tr></thead>
          <tbody>
            ${rows.map(r => `<tr>${headers.map(h => `<td>${cell(r[h])}</td>`).join('')}</tr>`).join('')}
          </tbody>
        </table>
        <!--
          Wait for the watermark rather than guessing at it. The old fixed 300ms
          was a race: on a cold cache the dialog opened before the image had
          arrived and the export came out unmarked, which is the worst kind of
          bug because it only happens the first time. The timeout stays as a
          floor so a file that never loads cannot leave a report unprintable.
        -->
        <script>
          (function () {
            var done = false;
            function go() { if (done) return; done = true; window.print(); }
            if (document.readyState === 'complete') go();
            else window.addEventListener('load', go);
            setTimeout(go, 2000);
          })();
        <\/script>
      </body>
    </html>`;

    if (typeof opts.onHtml === 'function') {
        try { opts.onHtml(html); } catch { /* archiving must never block the print */ }
    }

    const printWindow = window.open('', '_blank');
    if (printWindow) {
        printWindow.document.write(html);
        printWindow.document.close();
    } else {
        alert('Popup blocked. Please allow popups to print/export PDF.');
        return;
    }

    // File the same table that was just printed. Imported lazily so exportUtils
    // stays usable anywhere without dragging the api client in.
    if (opts.archive) {
        import('./archiveDoc')
            .then(({ archiveDoc }) => archiveDoc({ kind: 'Exports', ...opts.archive, html }))
            .catch(() => { /* best-effort */ });
    }
};
