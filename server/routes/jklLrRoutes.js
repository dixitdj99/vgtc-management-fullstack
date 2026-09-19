const express = require('express');
const router = express.Router();
const lrService = require('../services/lrService');
const { getCol } = require('../utils/collectionUtils');
const { tenancyMiddleware } = require('../middleware/tenancyMiddleware');
const { requireAuth } = require('../middleware/auth');
const { dispatchLrNotification, linkChallanToLr } = require('./lrWhatsAppHook');

// Apply tenancy to all routes in this router
router.use(requireAuth, tenancyMiddleware);

const JKL_LR_COL = 'jkl_loading_receipts';
const JKL_META_COL = 'jkl_metadata';

// Advisory: has a voucher already been written on this LR number?
const { mountLrVoucherCheck } = require('./lrVoucherCheck');
mountLrVoucherCheck(router, JKL_LR_COL);

// Create
router.post('/', async (req, res) => {
    try {
        const lrData = {
            ...req.body,
            source: req.body.loadingPoint || req.body.plant || req.body.source || 'JK Lakshmi Plant (Jharli)',
            createdBy: req.user?.id || req.user?.username || '',
            createdByName: req.user?.name || req.user?.username || '',
            creatorPhone: req.user?.phone || req.user?.mobile || ''
        };
        const result = await lrService.createLoadingReceipt(req.orgId, lrData, getCol(JKL_LR_COL, req), getCol(JKL_META_COL, req));

        // Real-time backup — runs whenever Google Drive is authorized
        const { backupLoadingReceipt } = require('../utils/realtimeBackup');
        backupLoadingReceipt({ ...lrData, ...result }, { brand: 'jklakshmi', plant: 'JK Lakshmi (Jharli)' });

        res.status(201).json(result);

        // WhatsApp Notification — fire and forget, never blocks response
        dispatchLrNotification({ ...lrData, ...result }, req);
    } catch (error) {
        res.status(error.status || 500).json({ error: error.message });
    }
});

// Get all
router.get('/', async (req, res) => {
    try {
        const receipts = await lrService.getAllLoadingReceipts(req.orgId, getCol(JKL_LR_COL, req));
        res.json(receipts);
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
            lrCollection: getCol(JKL_LR_COL, req),
            brand: 'jkl',
            orgId: req.orgId,
            req
        });
        res.json(result);
    } catch (error) {
        res.status(error.status || 500).json({ error: error.message });
    }
});

// Update billing only
router.patch('/:id/billing', async (req, res) => {
    try {
        await lrService.updateBillingStatus(req.params.id, req.body.billing, getCol(JKL_LR_COL, req));
        const driveService = require('../utils/driveService');
        if (await driveService.isAuthorized()) {
            const sheetsService = require('../utils/sheetsService');
            const all = await lrService.getAllLoadingReceipts(req.orgId, getCol(JKL_LR_COL, req));
            const doc = all.find(r => r.id === req.params.id);
            if (doc) await sheetsService.upsertLrRow(doc, 'jklakshmi').catch(()=>{});
        }
        res.json({ success: true });
    } catch (error) {
        res.status(error.status || 500).json({ error: error.message });
    }
});

// Update full LR (Support both PUT and PATCH)
router.put('/:id', async (req, res) => {
    try {
        await lrService.updateLoadingReceipt(req.params.id, req.body, getCol(JKL_LR_COL, req));
        const driveService = require('../utils/driveService');
        if (await driveService.isAuthorized()) {
            const sheetsService = require('../utils/sheetsService');
            const updated = { id: req.params.id, ...req.body };
            await sheetsService.upsertLrRow(updated, 'jklakshmi').catch(()=>{});
        }
        res.json({ success: true });
    } catch (error) {
        res.status(error.status || 500).json({ error: error.message });
    }
});

router.patch('/:id', async (req, res) => {
    try {
        await lrService.updateLoadingReceipt(req.params.id, req.body, getCol(JKL_LR_COL, req));
        const driveService = require('../utils/driveService');
        if (await driveService.isAuthorized()) {
            const sheetsService = require('../utils/sheetsService');
            const updated = { id: req.params.id, ...req.body };
            await sheetsService.upsertLrRow(updated, 'jklakshmi').catch(()=>{});
        }
        res.json({ success: true });
    } catch (error) {
        res.status(error.status || 500).json({ error: error.message });
    }
});

// Delete
router.delete('/:id', async (req, res) => {
    try {
        await lrService.deleteLoadingReceipt(req.params.id, getCol(JKL_LR_COL, req));
        const driveService = require('../utils/driveService');
        if (await driveService.isAuthorized()) {
            const sheetsService = require('../utils/sheetsService');
            await sheetsService.deleteLrRow(req.params.id, 'jklakshmi').catch(()=>{});
        }
        res.json({ success: true });
    } catch (error) {
        res.status(error.status || 500).json({ error: error.message });
    }
});

module.exports = router;
