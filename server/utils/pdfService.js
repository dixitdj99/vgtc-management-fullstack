const PDFDocument = require('pdfkit-table');
const fs = require('fs');
const path = require('path');

/**
 * Generates a PDF report for a specific module.
 * @param {string} moduleName Display name of the module
 * @param {Array} headers Table headers
 * @param {Array} rows Table rows
 * @param {string} outputPath Local path to save the PDF
 */
async function generateModuleReport(moduleName, headers, rows, outputPath) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ margin: 30, size: 'A4' });
        const stream = fs.createWriteStream(outputPath);
        doc.pipe(stream);

        // Header
        doc.fontSize(20).text('VGTC MANAGEMENT SYSTEM', { align: 'center' });
        doc.fontSize(14).text(`${moduleName.toUpperCase()} BACKUP REPORT`, { align: 'center' });
        doc.moveDown();
        doc.fontSize(10).text(`Generated on: ${new Date().toLocaleString()}`, { align: 'right' });
        doc.moveDown();

        // Table
        const table = {
            title: moduleName,
            headers: headers,
            rows: rows,
        };

        doc.table(table, {
            prepareHeader: () => doc.font('Helvetica-Bold').fontSize(8),
            prepareRow: (row, indexColumn, indexRow, rectRow, rectCell) => {
                doc.font('Helvetica').fontSize(8);
            },
        });

        doc.end();
        stream.on('finish', () => resolve(outputPath));
        stream.on('error', (err) => reject(err));
    });
}

/**
 * Generates a professional single-page PDF for an individual receipt/voucher.
 */
async function generateReceiptPDF(title, data, outputPath) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ margin: 40, size: 'A5', layout: 'landscape' });
        const stream = fs.createWriteStream(outputPath);
        doc.pipe(stream);

        // Header Box
        doc.rect(30, 30, doc.page.width - 60, 50).fill('#f8fafc');
        doc.fillColor('#1e293b').fontSize(18).font('Helvetica-Bold').text('VIKAS GOODS TRANSPORT', 40, 45, { align: 'center' });
        doc.fontSize(10).font('Helvetica').text(title.toUpperCase(), 40, 65, { align: 'center' });

        doc.moveDown(2.5);
        doc.fillColor('#000');

        // Main Content Grid
        const startY = 100;
        const col1 = 50;
        const col2 = 280;

        // Calculate totals for LRs (multi-material)
        let displayWeight = data.weight || 0;
        let displayBags = data.totalBags || data.bags || 0;
        if (data.materials && Array.isArray(data.materials)) {
            displayWeight = data.materials.reduce((sum, m) => sum + (parseFloat(m.weight) || 0), 0);
            displayBags = data.materials.reduce((sum, m) => sum + (parseInt(m.bags) || 0), 0);
        }

        // Info Rows
        const drawRow = (label, value, y) => {
            doc.fontSize(9).fillColor('#64748b').text(label.toUpperCase(), col1, y);
            doc.fontSize(11).fillColor('#000').font('Helvetica-Bold').text(String(value || '—'), col1, y + 12);
        };

        const drawRowRight = (label, value, y) => {
            doc.fontSize(9).fillColor('#64748b').text(label.toUpperCase(), col2, y);
            doc.fontSize(11).fillColor('#000').font('Helvetica-Bold').text(String(value || '—'), col2, y + 12);
        };

        drawRow('Receipt No / LR No', `#${data.lrNo || data.id || 'N/A'}`, startY);
        drawRowRight('Date', data.date, startY);

        drawRow('Truck Number', data.truckNo, startY + 40);
        drawRowRight('Destination', data.destination, startY + 40);

        drawRow('Weight / Qty', `${displayWeight} MT (${displayBags} Bags)`, startY + 80);
        drawRowRight('Party / Company', data.partyName || data.ownerName || '—', startY + 80);

        // Materials Breakdown Table (if multi-material)
        if (data.materials && data.materials.length > 0) {
            doc.moveDown(6);
            const tableY = doc.y;
            const table = {
                headers: [
                    { label: 'Material', property: 'type', width: 150 },
                    { label: 'Bags', property: 'bags', width: 100 },
                    { label: 'Weight (MT)', property: 'weight', width: 100 }
                ],
                rows: data.materials.map(m => [m.type, m.bags, `${m.weight} MT`])
            };
            doc.table(table, {
                prepareHeader: () => doc.font('Helvetica-Bold').fontSize(9),
                prepareRow: () => doc.font('Helvetica').fontSize(9),
            });
        }

        // Total Highlighter
        const total = data.totalAmount || data.total || 0;
        const totalY = data.materials && data.materials.length > 0 ? Math.max(220, doc.y + 20) : 220;
        
        doc.rect(30, totalY, doc.page.width - 60, 40).fill('#1e293b');
        doc.fillColor('#fff').fontSize(14).font('Helvetica-Bold').text('TOTAL AMOUNT / STATUS', 50, totalY + 13);
        doc.text(`Rs. ${total} | ${data.billing || 'N/A'}`, col2, totalY + 13, { align: 'left' });

        // Footer
        doc.fillColor('#94a3b8').fontSize(8).text(`System Backup ID: ${data.id || 'N/A'} | Generated: ${new Date().toLocaleString()}`, 30, doc.page.height - 40, { align: 'center' });

        doc.end();
        stream.on('finish', () => resolve(outputPath));
        stream.on('error', (err) => reject(err));
    });
}

module.exports = { generateModuleReport, generateReceiptPDF };
