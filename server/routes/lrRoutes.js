const express = require('express');
const router = express.Router();
const lrService = require('../services/lrService');
const { getCol } = require('../utils/collectionUtils');
const driveService = require('../utils/driveService');
const { tenancyMiddleware } = require('../middleware/tenancyMiddleware');
const { requireAuth } = require('../middleware/auth');

// Apply tenancy to all routes in this router
router.use(requireAuth, tenancyMiddleware);

const BASE_COL = 'loading_receipts';
const META_COL = 'metadata';

// Create
router.post('/', async (req, res) => {
    try {
        const result = await lrService.createLoadingReceipt(
            req.orgId,
            req.body, 
            getCol(BASE_COL, req), 
            getCol(META_COL, req)
        );

        // Real-time backup — runs whenever Google Drive is authorized
        if (await driveService.isAuthorized()) {
            (async () => {
                try {
                    const fs = require('fs');
                    const path = require('path');
                    const { generateLoadingReceiptPDF } = require('../utils/pdfService');

                    const TEMP_DIR = path.join(require('os').tmpdir(), 'vgtc_backups');
                    if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

                    const fullData = { ...req.body, ...result };
                    const dateStr = (fullData.date || new Date().toLocaleDateString('en-IN')).replace(/\//g, '-');
                    const fileName = `LR_${result.lrNo}_${dateStr}.pdf`;
                    const localPath = path.join(TEMP_DIR, fileName);

                    console.log(`[Backup-Hook] Generating LR PDF: ${fileName}`);
                    await generateLoadingReceiptPDF(fullData, localPath);

                    const rootId = await driveService.getOrCreateFolder('VGTC_Backups');
                    const brand = req.body.brand === 'jklakshmi' ? 'JK_Lakshmi' : 'JK_Super';
                    const plantFolder = await driveService.getOrCreateFolder(brand, rootId);
                    const lrFolder = await driveService.getOrCreateFolder('Loading Receipts', plantFolder);
                    const monthStr = new Date(fullData.date || Date.now()).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }).replace(/ /g, '_');
                    const finalFolder = await driveService.getOrCreateFolder(monthStr, lrFolder);
                    await driveService.uploadFile(localPath, fileName, finalFolder);
                    if (fs.existsSync(localPath)) fs.unlinkSync(localPath);

                    const sheetsService = require('../utils/sheetsService');
                    await sheetsService.upsertLrRow(fullData, req.body.brand === 'jklakshmi' ? 'jklakshmi' : 'jksuper');

                    await driveService.logActivity('LR_Create', 'success', `Backed up: ${fileName}`);
                    console.log(`[Backup-Hook] LR backed up successfully: ${fileName}`);
                } catch (e) {
                    console.error('[Backup-Hook] LR create FAILED:', e.message, e.stack);
                    await driveService.logActivity('LR_Create', 'error', 'Backup failed', e);
                }
            })();
        } else {
            console.log('[Backup-Hook] Skipping LR backup — Drive not authorized');
        }

        res.status(201).json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get all
router.get('/', async (req, res) => {
    try {
        const receipts = await lrService.getAllLoadingReceipts(req.orgId, getCol(BASE_COL, req));
        res.json(receipts);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update billing only
router.patch('/:id/billing', async (req, res) => {
    try {
        await lrService.updateBillingStatus(req.params.id, req.body.billing, getCol(BASE_COL, req));
        if (await driveService.isAuthorized()) {
            const sheetsService = require('../utils/sheetsService');
            const all = await lrService.getAllLoadingReceipts(req.orgId, getCol(BASE_COL, req));
            const doc = all.find(r => r.id === req.params.id);
            if (doc) await sheetsService.upsertLrRow(doc, req.body.brand === 'jklakshmi' ? 'jklakshmi' : 'jksuper').catch(()=>{});
        }
        res.json({ message: 'Billing status updated' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Full update of a single receipt row (Support both PATCH and PUT)
router.patch('/:id', async (req, res) => {
    try {
        await lrService.updateLoadingReceipt(req.params.id, req.body, getCol(BASE_COL, req));
        if (await driveService.isAuthorized()) {
            const sheetsService = require('../utils/sheetsService');
            const updated = { id: req.params.id, ...req.body };
            await sheetsService.upsertLrRow(updated, req.body.brand === 'jklakshmi' ? 'jklakshmi' : 'jksuper').catch(()=>{});
        }
        res.json({ message: 'Receipt updated successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.put('/:id', async (req, res) => {
    try {
        await lrService.updateLoadingReceipt(req.params.id, req.body, getCol(BASE_COL, req));
        if (await driveService.isAuthorized()) {
            const sheetsService = require('../utils/sheetsService');
            const updated = { id: req.params.id, ...req.body };
            await sheetsService.upsertLrRow(updated, req.body.brand === 'jklakshmi' ? 'jklakshmi' : 'jksuper').catch(()=>{});
        }
        res.json({ message: 'Receipt updated successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete
router.delete('/:id', async (req, res) => {
    try {
        await lrService.deleteLoadingReceipt(req.params.id, getCol(BASE_COL, req), getCol(META_COL, req));
        if (await driveService.isAuthorized()) {
            const sheetsService = require('../utils/sheetsService');
            // brand param is trickier on delete query args, defaulting to jksuper is usually fine for lrRoutes or derive from query
            await sheetsService.deleteLrRow(req.params.id, req.query.brand === 'jklakshmi' ? 'jklakshmi' : 'jksuper').catch(()=>{});
        }
        res.json({ message: 'Receipt deleted' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update LR status with history tracking
router.patch('/:id/status', async (req, res) => {
    const { status, updatedBy } = req.body;
    const VALID = ['Created', 'Loaded', 'In Transit', 'Delivered', 'Billed'];
    if (!VALID.includes(status)) return res.status(400).json({ error: 'Invalid status' });
    try {
        const { db, admin, isAvailable } = require('../firebase');
        const col = getCol(BASE_COL, req);
        const entry = { status, timestamp: new Date().toISOString(), updatedBy: updatedBy || 'system' };
        if (isAvailable()) {
            await db.collection(col).doc(req.params.id).update({
                status,
                statusHistory: admin.firestore.FieldValue.arrayUnion(entry),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
        }
        res.json({ message: 'Status updated', status, entry });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Bulk Invoice Generation — returns PDF buffer
router.post('/invoice/generate', async (req, res) => {
    try {
        const { ids, billNo, billDate, plantKey, items, brand } = req.body;
        const invoiceNumber = billNo || req.body.invoiceNumber;
        const invoiceDate = billDate || req.body.invoiceDate;

        // Mark LRs as invoiced in database
        if (ids && ids.length > 0) {
            try {
                await lrService.generateBulkInvoice(ids, invoiceNumber, invoiceDate, getCol(BASE_COL, req));
            } catch (dbErr) {
                console.warn('[Invoice] LR update failed (non-fatal):', dbErr.message);
            }
        }

        // Generate PDF buffer
        const { generateInvoicePDF } = require('../utils/pdfService');
        const pdfBuffer = await generateInvoicePDF({ plantKey, billNo: invoiceNumber, billDate: invoiceDate, items }, null);

        // Background backup to Google Drive
        if (await driveService.isAuthorized()) {
            (async () => {
                try {
                    const fs = require('fs');
                    const path = require('path');
                    const TEMP_DIR = path.join(require('os').tmpdir(), 'vgtc_backups');
                    if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

                    const safeInvoiceNo = (invoiceNumber || 'Untitled').replace(/[/\\?%*:|"<>]/g, '-');
                    const fileName = `Invoice_${safeInvoiceNo}_${Date.now()}.pdf`;
                    const localPath = path.join(TEMP_DIR, fileName);

                    require('fs').writeFileSync(localPath, pdfBuffer);

                    const rootId = await driveService.getOrCreateFolder('VGTC_Backups');
                    const plantName = brand === 'jklakshmi' ? 'JK_Lakshmi' : 'JK_Super';
                    const plantFolder = await driveService.getOrCreateFolder(plantName, rootId);
                    const finalFolder = await driveService.getOrCreateFolder('Invoices', plantFolder);

                    await driveService.uploadFile(localPath, fileName, finalFolder);
                    if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
                    console.log(`[Backup-Hook] Invoice backed up: ${fileName}`);
                } catch (e) {
                    console.error('[Backup-Hook] Invoice backup FAILED:', e.message);
                }
            })();
        }

        // Return PDF
        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="Invoice_${invoiceNumber || 'draft'}.pdf"`,
            'Content-Length': pdfBuffer.length,
        });
        res.send(pdfBuffer);
    } catch (error) {
        console.error('Invoice generation failed:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
