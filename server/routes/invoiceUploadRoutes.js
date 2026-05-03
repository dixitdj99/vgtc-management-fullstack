const express = require('express');
const router = express.Router();
const multer = require('multer');
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

// Multer config — store in memory for parsing
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

/**
 * POST /api/invoice-upload/parse
 * Upload an XLSX file, parse Sheet1 & Sheet2,
 * filter for blank "SALES DOC TYPE" (JK Super Dump entries),
 * cross-verify against Sheet2 (GRN data).
 */
router.post('/parse', upload.single('file'), (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

        const wb = XLSX.read(req.file.buffer, { type: 'buffer' });

        if (wb.SheetNames.length < 2) {
            return res.status(400).json({ error: 'XLSX must contain at least 2 sheets (Billing + GRN)' });
        }

        // ── Parse Sheet1 (Billing Data) ─────────────────────────
        const ws1 = wb.Sheets[wb.SheetNames[0]];
        const sheet1Data = XLSX.utils.sheet_to_json(ws1);

        // Filter: only rows where SALES DOC TYPE is blank/undefined/null
        const dumpEntries = sheet1Data.filter(row => {
            const sdt = row['SALES DOC TYPE'];
            return !sdt || String(sdt).trim() === '';
        });

        // ── Parse Sheet2 (GRN / Delivery Confirmation) ──────────
        const ws2 = wb.Sheets[wb.SheetNames[1]];
        const sheet2Data = XLSX.utils.sheet_to_json(ws2);

        // Build a lookup map from Sheet2 by LR No
        const grnMap = new Map();
        sheet2Data.forEach(row => {
            const lrNo = String(row['LR No'] || '').trim();
            if (lrNo) {
                // Multiple entries per LR possible (different materials)
                if (!grnMap.has(lrNo)) {
                    grnMap.set(lrNo, []);
                }
                grnMap.set(lrNo, [...grnMap.get(lrNo), {
                    truckNo: row['Truck No'] || '',
                    invoiceDoc: row['Invoice Doc'] || '',
                    invoiceDate: row['Invoice Date'] || '',
                    billedQty: parseFloat(row['Billed Qty']) || 0,
                    recdQty: parseFloat(row['Recd. Qty']) || 0,
                    shortQty: parseFloat(row['Short Qty']) || 0,
                    depotName: row['Depot Name'] || '',
                    materialGroup: row['MATERIAL GROUP'] || '',
                    materialCode: row['MATERIAL CODE'] || '',
                    diNumber: row['DI NUMBER'] || '',
                    state: row['State'] || '',
                }]);
            }
        });

        // ── Cross-verify & build result ─────────────────────────
        const entries = dumpEntries.map((row, idx) => {
            const lrNo = String(row['LR NUMBER'] || '').trim();
            const vehicleNo = String(row['VEHICLE NUMBER'] || '').trim();
            const grnEntries = grnMap.get(lrNo);
            const foundInSheet2 = !!grnEntries && grnEntries.length > 0;

            // Aggregate GRN data if found
            let recdQty = 0, shortQty = 0, depotName = '', materialGroup = '';
            if (foundInSheet2) {
                recdQty = grnEntries.reduce((s, g) => s + g.recdQty, 0);
                shortQty = grnEntries.reduce((s, g) => s + g.shortQty, 0);
                depotName = grnEntries[0].depotName;
                materialGroup = grnEntries.map(g => g.materialGroup).join(', ');
            }

            // Parse billing date from dd.mm.yyyy format
            let billingDate = row['BILLING DATE'] || '';
            if (typeof billingDate === 'string' && billingDate.includes('.')) {
                const parts = billingDate.split('.');
                if (parts.length === 3) {
                    billingDate = `${parts[0]}.${parts[1]}.${parts[2]}`;
                }
            }

            return {
                idx,
                lrNo,
                vehicleNo,
                billingDate,
                countyName: row['COUNTY NAME'] || '',
                customerDescription: row['CUSTOMER DESCRIPTION'] || '',
                deliveryNumber: row['DELIVERY NUMBER'] || '',
                salesQty: parseFloat(row['SALES QUANTITY - TO']) || 0,
                invoiceNo: row['INVOICE NO'] || '',
                regionDesc: row['REGION DESC.'] || '',
                priFreightA: parseFloat(row['PRI FREIGHT (A)']) || 0,
                priFreightB: parseFloat(row['PRI FREIGHT (B)']) || 0,
                totalFreight: parseFloat(row['TOTAL FRIGHT']) || 0,
                shippingConditions: row['SHIPPING CONDITIONS'] || '',
                soOrPoNumber: row['SO OR PO NUMBER'] || '',
                cityName: row['CITY NAME'] || '',
                // GRN cross-check
                foundInSheet2,
                recdQty,
                shortQty,
                depotName,
                materialGroup,
            };
        });

        const validCount = entries.filter(e => e.foundInSheet2).length;
        const invalidCount = entries.filter(e => !e.foundInSheet2).length;

        res.json({
            totalSheet1: sheet1Data.length,
            totalFiltered: dumpEntries.length,
            totalSheet2: sheet2Data.length,
            validCount,
            invalidCount,
            entries,
        });
    } catch (err) {
        console.error('[Invoice Upload] Parse error:', err);
        res.status(500).json({ error: 'Failed to parse XLSX: ' + err.message });
    }
});

/**
 * POST /api/invoice-upload/generate
 * Accept validated entries and generate a freight bill PDF.
 */
router.post('/generate', express.json(), async (req, res) => {
    try {
        const { entries, billNo, billDate, gstRate } = req.body;

        if (!entries || entries.length === 0) {
            return res.status(400).json({ error: 'No entries provided' });
        }
        if (!billNo) return res.status(400).json({ error: 'Bill number is required' });

        const { generateDumpFreightInvoicePDF } = require('../utils/pdfService');

        const TEMP_DIR = path.join(__dirname, '..', 'temp_backups');
        if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

        const safeBillNo = String(billNo).replace(/[/\\?%*:|"<>]/g, '-');
        const fileName = `FreightBill_${safeBillNo}_${Date.now()}.pdf`;
        const localPath = path.join(TEMP_DIR, fileName);

        await generateDumpFreightInvoicePDF({
            entries,
            billNo,
            billDate: billDate || new Date().toLocaleDateString('en-IN'),
            gstRate: parseFloat(gstRate) || 12,
        }, localPath);

        // Send the PDF as download
        res.download(localPath, fileName, (err) => {
            // Clean up temp file after send
            if (fs.existsSync(localPath)) {
                try { fs.unlinkSync(localPath); } catch (e) { /* ignore */ }
            }
            if (err && !res.headersSent) {
                console.error('[Invoice Upload] Download error:', err);
                res.status(500).json({ error: 'Failed to send PDF' });
            }
        });
    } catch (err) {
        console.error('[Invoice Upload] Generate error:', err);
        res.status(500).json({ error: 'Failed to generate invoice: ' + err.message });
    }
});

module.exports = router;
