const express = require('express');
const router = express.Router();
const svc = require('../utils/cashbookService');
const { getCol } = require('../utils/collectionUtils');

const BASE_COL = 'jkl_cashbook';

const sheetsService = require('../utils/sheetsService');

// GET  /api/jkl/cashbook
router.get('/', async (req, res) => {
    try {
        const data = await svc.getAll(getCol(BASE_COL, req));
        res.json(data);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/jkl/cashbook/deposit
router.post('/deposit', async (req, res) => {
    const { amount, remark, date } = req.body;
    try {
        const doc = await svc.addEntry('deposit', amount, remark, date, getCol(BASE_COL, req));
        sheetsService.upsertCashbook(doc, 'jklakshmi').catch(err => console.error('[Backup Hook] Cashbook upsert failed:', err.message));
        res.status(201).json(doc);
    } catch (e) { res.status(400).json({ error: e.message }); }
});

// POST /api/jkl/cashbook/cash-out
router.post('/cash-out', async (req, res) => {
    const { amount, remark, date } = req.body;
    try {
        const doc = await svc.addEntry('cash_out', amount, remark, date, getCol(BASE_COL, req));
        sheetsService.upsertCashbook(doc, 'jklakshmi').catch(err => console.error('[Backup Hook] Cashbook upsert failed:', err.message));
        res.status(201).json(doc);
    } catch (e) { res.status(400).json({ error: e.message }); }
});

// DELETE /api/jkl/cashbook/:id
router.delete('/:id', async (req, res) => {
    try {
        const all = await svc.getAll(getCol(BASE_COL, req));
        const entry = all.find(e => e.id === req.params.id);
        
        await svc.deleteEntry(req.params.id, getCol(BASE_COL, req));
        
        if (entry) {
            sheetsService.deleteCashbook(req.params.id, entry.type, 'jklakshmi').catch(err => console.error('[Backup Hook] Cashbook delete failed:', err.message));
        }
        res.json({ message: 'Deleted' });
    } catch (e) { res.status(404).json({ error: e.message }); }
});

module.exports = router;
