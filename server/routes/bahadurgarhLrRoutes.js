const express = require('express');
const router = express.Router();
const lrService = require('../services/lrService');
const { getCol } = require('../utils/collectionUtils');
const driveService = require('../utils/driveService');
const { tenancyMiddleware } = require('../middleware/tenancyMiddleware');
const { requireAuth } = require('../middleware/auth');
const { dispatchLrNotification, linkChallanToLr } = require('./lrWhatsAppHook');

// Apply tenancy to all routes in this router
router.use(requireAuth, tenancyMiddleware);

const BASE_COL = 'bahadurgarh_loading_receipts';
const META_COL = 'bahadurgarh_metadata';

// Advisory: has a voucher already been written on this LR number?
const { mountLrVoucherCheck } = require('./lrVoucherCheck');
mountLrVoucherCheck(router, BASE_COL);

// Create
router.post('/', async (req, res) => {
    try {
        const lrData = {
            ...req.body,
            source: req.body.source || 'Bahadurgarh',
            createdBy: req.user?.id || req.user?.username || '',
            createdByName: req.user?.name || req.user?.username || '',
            creatorPhone: req.user?.phone || req.user?.mobile || ''
        };
        const result = await lrService.createLoadingReceipt(
            req.orgId,
            lrData, 
            getCol(BASE_COL, req), 
            getCol(META_COL, req)
        );

        // Real-time backup — runs whenever Google Drive is authorized
        const { backupLoadingReceipt } = require('../utils/realtimeBackup');
        backupLoadingReceipt({ ...lrData, ...result }, { plant: 'Bahadurgarh', brand: 'bahadurgarh' });

        res.status(201).json(result);

        // WhatsApp Notification — fire and forget, never blocks response
        dispatchLrNotification({ ...lrData, ...result }, req);
    } catch (error) {
        res.status(error.status || 500).json({ error: error.message });
    }
});

// Link challan to an existing LR (Delayed Linking)
router.post('/:id/link-challan', async (req, res) => {
    try {
        const { challanNo, quantity, material } = req.body;
        const result = await linkChallanToLr({
            lrId: req.params.id,
            challanNo,
            quantity,
            material,
            lrCollection: getCol(BASE_COL, req),
            brand: 'bahadurgarh',
            orgId: req.orgId,
            req
        });
        res.json(result);
    } catch (error) {
        res.status(error.status || 500).json({ error: error.message });
    }
});

// Get all
router.get('/', async (req, res) => {
    try {
        const receipts = await lrService.getAllLoadingReceipts(req.orgId, getCol(BASE_COL, req));
        res.json(receipts);
    } catch (error) {
        res.status(error.status || 500).json({ error: error.message });
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
        res.status(error.status || 500).json({ error: error.message });
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
        res.status(error.status || 500).json({ error: error.message });
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
        res.status(error.status || 500).json({ error: error.message });
    }
});

// Delete
router.delete('/:id', async (req, res) => {
    try {
        await lrService.deleteLoadingReceipt(req.params.id, getCol(BASE_COL, req), getCol(META_COL, req));
        if (await driveService.isAuthorized()) {
            const sheetsService = require('../utils/sheetsService');
            await sheetsService.deleteLrRow(req.params.id, req.query.brand === 'jklakshmi' ? 'jklakshmi' : 'jksuper').catch(()=>{});
        }
        res.json({ message: 'Receipt deleted' });
    } catch (error) {
        res.status(error.status || 500).json({ error: error.message });
    }
});

// Bulk Invoice Generation — returns PDF buffer
router.post('/invoice/generate', async (req, res) => {
    try {
        const { ids, billNo, billDate, plantKey, items, brand } = req.body;
        const invoiceNumber = billNo || req.body.invoiceNumber;
        const invoiceDate = billDate || req.body.invoiceDate;

        if (ids && ids.length > 0) {
            try {
                await lrService.generateBulkInvoice(ids, invoiceNumber, invoiceDate, getCol(BASE_COL, req));
            } catch (dbErr) {
                console.warn('[Invoice] Bahadurgarh LR update failed (non-fatal):', dbErr.message);
            }
        }

        const { generateInvoicePDF } = require('../utils/pdfService');
        const pdfBuffer = await generateInvoicePDF({ plantKey, billNo: invoiceNumber, billDate: invoiceDate, items }, null);

        if (await driveService.isAuthorized().catch(() => false)) {
            (async () => {
                try {
                    const backupPathUtils = require('../utils/backupPathUtils');
                    const segments = backupPathUtils.resolveBackupFolderSegments({
                        module: 'Invoices',
                        date: invoiceDate,
                    });
                    const fileName = backupPathUtils.resolveBackupFileName({
                        module: 'Invoices',
                        id: invoiceNumber,
                        date: invoiceDate,
                    });

                    const folderId = await driveService.ensurePath(segments);
                    await driveService.upsertBuffer(pdfBuffer, fileName, folderId, 'application/pdf');
                    await driveService.logActivity('Invoice_Backup', 'success', `Backed up: ${fileName} in ${segments.join('/')}`);
                    console.log(`[Backup-Hook] Bahadurgarh Invoice backed up: ${fileName} in ${segments.join('/')}`);
                } catch (e) {
                    console.error('[Backup-Hook] Bahadurgarh Invoice backup FAILED:', e.message);
                }
            })();
        }

        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="Invoice_${invoiceNumber || 'draft'}.pdf"`,
            'Content-Length': pdfBuffer.length,
        });
        res.send(pdfBuffer);
    } catch (error) {
        console.error('Invoice generation failed:', error);
        res.status(error.status || 500).json({ error: error.message });
    }
});

module.exports = router;
