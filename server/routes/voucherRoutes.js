const express = require('express');
const router = express.Router();
const voucherService = require('../services/voucherService');
const { getCol } = require('../utils/collectionUtils');

const BASE_COL = 'vouchers';

// Create
router.post('/', async (req, res) => {
    try {
        const result = await voucherService.createVoucher(req.body, getCol(BASE_COL, req));
        
        // Real-time backup (fire-and-forget, non-blocking)
        const { backupEntryToDrive, PLANTS } = require('../utils/backupService');
        const plant = req.body.type === 'JK_Lakshmi' ? PLANTS.LAKSHMI : PLANTS.SUPER;
        backupEntryToDrive('Voucher', result, plant).catch(e => console.error('[Backup-Hook] Failed:', e.message));

        res.status(201).json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get all by type
router.get('/:type', async (req, res) => {
    try {
        const vouchers = await voucherService.getVouchersByType(req.params.type, getCol(BASE_COL, req));
        res.json(vouchers);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Full update
router.patch('/:id', async (req, res) => {
    try {
        await voucherService.updateVoucher(req.params.id, req.body, getCol(BASE_COL, req));
        res.json({ message: 'Voucher updated' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete
router.delete('/:id', async (req, res) => {
    try {
        await voucherService.deleteVoucher(req.params.id, getCol(BASE_COL, req));
        res.json({ message: 'Voucher deleted' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
