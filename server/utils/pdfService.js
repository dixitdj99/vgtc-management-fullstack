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

module.exports = { generateModuleReport };
