/**
 * htmlPdfService.js
 * 
 * Converts arbitrary HTML documents (printed reports, balance sheets, challan lists)
 * into clean, formatted, readable PDF buffers using pdfkit-table.
 * 
 * Ensures that Google Drive NEVER receives raw unrendered HTML files,
 * but always proper, viewable .pdf files.
 */

const PDFDocument = require('pdfkit-table');

/** Decode common HTML entities */
function decodeEntities(str) {
  if (!str) return '';
  return String(str)
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x20B9;/g, 'Rs. ')
    .replace(/₹/g, 'Rs. ');
}

/** Extract table headers and rows from an HTML string */
function extractTableFromHtml(html) {
  const cleanHtml = html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');

  const tableMatch = cleanHtml.match(/<table[^>]*>([\s\S]*?)<\/table>/i);
  if (!tableMatch) return null;

  const tableContent = tableMatch[1];
  const trMatches = tableContent.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
  if (trMatches.length === 0) return null;

  let headers = [];
  const rows = [];

  for (const tr of trMatches) {
    const ths = tr.match(/<th[^>]*>([\s\S]*?)<\/th>/gi);
    if (ths && headers.length === 0) {
      headers = ths.map(th => {
        const text = th.replace(/<[^>]*>/g, '').trim();
        return decodeEntities(text);
      });
      continue;
    }

    const tds = tr.match(/<td[^>]*>([\s\S]*?)<\/td>/gi);
    if (tds) {
      const row = tds.map(td => {
        const text = td.replace(/<[^>]*>/g, '').trim();
        return decodeEntities(text);
      });
      if (headers.length === 0) {
        // First row acted as header if no <th>
        headers = row;
      } else {
        rows.push(row);
      }
    }
  }

  if (headers.length === 0 && rows.length === 0) return null;
  return { headers, rows };
}

/** Extract text lines from HTML, preserving headings and paragraphs */
function extractTextLinesFromHtml(html) {
  const cleanHtml = html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi, '\n### $1\n')
    .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '\n$1\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<div[^>]*>([\s\S]*?)<\/div>/gi, '\n$1\n')
    .replace(/<[^>]*>/g, ' ');

  return cleanHtml
    .split('\n')
    .map(line => decodeEntities(line.replace(/\s+/g, ' ').trim()))
    .filter(Boolean);
}

/**
 * Converts HTML markup to a PDF Buffer.
 * 
 * @param {string} title Document title
 * @param {string} html HTML content
 * @param {object} [opts] Options
 * @returns {Promise<Buffer>}
 */
async function convertHtmlToPdfBuffer(title, html, opts = {}) {
  return new Promise((resolve, reject) => {
    const tableData = extractTableFromHtml(html || '');
    const isWide = tableData && tableData.headers.length > 6;
    const doc = new PDFDocument({
      size: 'A4',
      layout: isWide ? 'landscape' : 'portrait',
      margin: 28,
    });

    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const PW = doc.page.width;
    const PH = doc.page.height;
    const M = 28;
    const CW = PW - M * 2;

    // ── Header Banner ──
    doc.rect(M, M, CW, 36).fill('#1e293b');
    doc.fontSize(13).font('Helvetica-Bold').fillColor('#ffffff')
      .text('VIKAS GOODS TRANSPORT CO.', M + 12, M + 7);
    doc.fontSize(9).font('Helvetica').fillColor('#94a3b8')
      .text(`${title || 'Document Archive'} • Generated: ${new Date().toLocaleString('en-IN')}`, M + 12, M + 22);

    let currentY = M + 46;

    // ── Table Content ──
    if (tableData && tableData.headers.length > 0 && tableData.rows.length > 0) {
      doc.y = currentY;
      try {
        const table = {
          title: title || 'Report Summary',
          headers: tableData.headers,
          rows: tableData.rows,
        };
        doc.table(table, {
          prepareHeader: () => doc.font('Helvetica-Bold').fontSize(8).fillColor('#1e293b'),
          prepareRow: (row, i) => doc.font('Helvetica').fontSize(7.5).fillColor('#334155'),
        });
      } catch (err) {
        // Fallback: draw rows directly
        doc.y = currentY;
        const textLines = extractTextLinesFromHtml(html || '');
        textLines.forEach(line => {
          if (doc.y > PH - 40) doc.addPage();
          if (line.startsWith('###')) {
            doc.fontSize(10).font('Helvetica-Bold').fillColor('#1e293b').text(line.replace('###', '').trim());
          } else {
            doc.fontSize(8).font('Helvetica').fillColor('#334155').text(line);
          }
        });
      }
    } else {
      // ── Text Content ──
      doc.y = currentY;
      const textLines = extractTextLinesFromHtml(html || '');
      textLines.forEach(line => {
        if (doc.y > PH - 40) doc.addPage();
        if (line.startsWith('###')) {
          doc.moveDown(0.5);
          doc.fontSize(10).font('Helvetica-Bold').fillColor('#1e293b').text(line.replace('###', '').trim());
          doc.moveDown(0.2);
        } else {
          doc.fontSize(8.5).font('Helvetica').fillColor('#334155').text(line);
        }
      });
    }

    // ── Footer ──
    doc.fontSize(7).font('Helvetica').fillColor('#94a3b8')
      .text(`VGTC Archive • ${new Date().toLocaleDateString('en-IN')}`, M, PH - 20, { align: 'center', width: CW });

    doc.end();
  });
}

module.exports = {
  convertHtmlToPdfBuffer,
  extractTableFromHtml,
  extractTextLinesFromHtml,
  decodeEntities,
};
