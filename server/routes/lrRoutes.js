const express = require('express');
const router = express.Router();
const lrService = require('../services/lrService');

// Create
router.post('/', async (req, res) => {
    try {
        const result = await lrService.createLoadingReceipt(req.body);
        res.status(201).json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get all
router.get('/', async (req, res) => {
    try {
        const receipts = await lrService.getAllLoadingReceipts();
        res.json(receipts);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update billing only
router.patch('/:id/billing', async (req, res) => {
    try {
        await lrService.updateBillingStatus(req.params.id, req.body.billing);
        res.json({ message: 'Billing status updated' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Full update of a single receipt row (Support both PATCH and PUT)
router.patch('/:id', async (req, res) => {
    try {
        await lrService.updateLoadingReceipt(req.params.id, req.body);
        res.json({ message: 'Receipt updated successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.put('/:id', async (req, res) => {
    try {
        await lrService.updateLoadingReceipt(req.params.id, req.body);
        res.json({ message: 'Receipt updated successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete
router.delete('/:id', async (req, res) => {
    try {
        await lrService.deleteLoadingReceipt(req.params.id);
        res.json({ message: 'Receipt deleted' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
