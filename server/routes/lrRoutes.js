const express = require('express');
const router = express.Router();
const lrService = require('../services/lrService');
const { getCol } = require('../utils/collectionUtils');
const { isProduction } = require('../utils/envConfig');

const BASE_COL = 'loading_receipts';
const META_COL = 'metadata';

// Create
router.post('/', async (req, res) => {
    try {
        const result = await lrService.createLoadingReceipt(
            req.body, 
            getCol(BASE_COL, req), 
            getCol(META_COL, req)
        );

        // Real-time backup (fire-and-forget, non-blocking)
        // Only run in production to keep Drive data clean
        if (isProduction()) {
            const { backupEntryToDrive, PLANTS } = require('../utils/backupService');
            const fullData = { ...req.body, ...result };
            backupEntryToDrive('Loading_Receipt', fullData, PLANTS.SUPER).catch(e => console.error('[Backup-Hook] Failed:', e.message));
        }

        res.status(201).json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get all
router.get('/', async (req, res) => {
    try {
        const receipts = await lrService.getAllLoadingReceipts(getCol(BASE_COL, req));
        res.json(receipts);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update billing only
router.patch('/:id/billing', async (req, res) => {
    try {
        await lrService.updateBillingStatus(req.params.id, req.body.billing, getCol(BASE_COL, req));
        res.json({ message: 'Billing status updated' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Full update of a single receipt row (Support both PATCH and PUT)
router.patch('/:id', async (req, res) => {
    try {
        await lrService.updateLoadingReceipt(req.params.id, req.body, getCol(BASE_COL, req));
        res.json({ message: 'Receipt updated successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.put('/:id', async (req, res) => {
    try {
        await lrService.updateLoadingReceipt(req.params.id, req.body, getCol(BASE_COL, req));
        res.json({ message: 'Receipt updated successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete
router.delete('/:id', async (req, res) => {
    try {
        await lrService.deleteLoadingReceipt(req.params.id, getCol(BASE_COL, req), getCol(META_COL, req));
        res.json({ message: 'Receipt deleted' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
