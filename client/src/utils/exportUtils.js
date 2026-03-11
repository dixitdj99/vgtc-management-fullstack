import * as XLSX from 'xlsx';

/**
 * Downloads an array of objects as an Excel file.
 * @param {Array<Object>} rows - The data to export
 * @param {String} filename - Name of the output file (without .xlsx)
 */
export const exportToExcel = (rows, filename = 'export') => {
    if (!rows || rows.length === 0) {
        alert('No data to export.');
        return;
    }
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Data');
    XLSX.writeFile(workbook, `${filename}.xlsx`);
};

/**
 * Opens a print dialog with a styled HTML table of the provided data.
 * The browser's print dialog allows saving as PDF.
 * @param {Array<Object>} rows - The data to print
 * @param {String} title - The title of the document
 * @param {Array<String>} columns - Optional: specifies which object keys to print and in what order
 */
export const exportToPDF = (rows, title = 'Document Export', columns = null) => {
    if (!rows || rows.length === 0) {
        alert('No data to print.');
        return;
    }

    // Determine headers
    let headers = columns;
    if (!headers) {
        headers = Object.keys(rows[0]).filter(k => k !== 'id' && !k.startsWith('_'));
    }

    // Build HTML table
    const tableHTML = `
    <table style="width: 100%; border-collapse: collapse; font-family: sans-serif; font-size: 12px;">
      <thead>
        <tr>
          ${headers.map(h => `<th style="border: 1px solid #ccc; padding: 6px 8px; background: #f4f4f5; text-align: left; text-transform: capitalize;">${h.replace(/([A-Z])/g, ' $1')}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${rows.map(row => `
          <tr>
            ${headers.map(h => `<td style="border: 1px solid #ccc; padding: 6px 8px;">${row[h] !== null && row[h] !== undefined ? row[h] : ''}</td>`).join('')}
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

    // Build Document
    const html = `
    <html>
      <head>
        <title>${title}</title>
        <style>
          body { font-family: system-ui, -apple-system, sans-serif; color: #1f2937; padding: 20px; }
          h2 { margin-top: 0; color: #111827; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px; }
          @media print {
            body { padding: 0; }
            button { display: none !important; }
          }
        </style>
      </head>
      <body>
        <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 20px;">
          <h2>${title}</h2>
          <button onclick="window.print()" style="padding: 8px 16px; background: #6366f1; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold;">Print / Save PDF</button>
        </div>
        ${tableHTML}
        <script>
          // Auto-open print dialog after a tiny delay to ensure rendering
          setTimeout(() => window.print(), 300);
        </script>
      </body>
    </html>
  `;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
        printWindow.document.write(html);
        printWindow.document.close();
    } else {
        alert('Popup blocked. Please allow popups to print/export PDF.');
    }
};
