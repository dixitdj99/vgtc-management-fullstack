const express = require('express');
const router = express.Router();
const svc = require('../utils/cashbookService');
const { getCol } = require('../utils/collectionUtils');
const { tenancyMiddleware } = require('../middleware/tenancyMiddleware');
const { requireAuth } = require('../middleware/auth');

// Apply tenancy to all routes in this router
router.use(requireAuth, tenancyMiddleware);
const BASE_COL = 'cashbook';

const sheetsService = require('../utils/sheetsService');

// GET  /api/cashbook
router.get('/', async (req, res) => {
    try {
        const data = await svc.getAll(req.orgId, getCol(BASE_COL, req));
        res.json(data);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/cashbook/deposit
router.post('/deposit', async (req, res) => {
    const { amount, remark, date } = req.body;
    try {
        const doc = await svc.addEntry(req.orgId, 'deposit', amount, remark, date, getCol(BASE_COL, req));
        sheetsService.upsertCashbook(doc, 'jksuper').catch(err => console.error('[Backup Hook] Cashbook upsert failed:', err.message));
        res.status(201).json(doc);
    } catch (e) { res.status(400).json({ error: e.message }); }
});

// POST /api/cashbook/cash-out
router.post('/cash-out', async (req, res) => {
    const { amount, remark, date } = req.body;
    try {
        const doc = await svc.addEntry(req.orgId, 'cash_out', amount, remark, date, getCol(BASE_COL, req));
        sheetsService.upsertCashbook(doc, 'jksuper').catch(err => console.error('[Backup Hook] Cashbook upsert failed:', err.message));
        res.status(201).json(doc);
    } catch (e) { res.status(400).json({ error: e.message }); }
});

// DELETE /api/cashbook/:id
router.delete('/:id', async (req, res) => {
    try {
        const all = await svc.getAll(req.orgId, getCol(BASE_COL, req));
        const entry = all.find(e => e.id === req.params.id);
        
        await svc.deleteEntry(req.params.id, getCol(BASE_COL, req));
        
        if (entry) {
            sheetsService.deleteCashbook(req.params.id, entry.type, 'jksuper').catch(err => console.error('[Backup Hook] Cashbook delete failed:', err.message));
        }
        res.json({ message: 'Deleted' });
    } catch (e) { res.status(404).json({ error: e.message }); }
});

module.exports = router;
