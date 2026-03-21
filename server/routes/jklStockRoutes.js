const express = require('express');
const router = express.Router();
const svc = require('../utils/stockService');

/* JK Lakshmi Collection Overrides */
const JKL_STOCK_COL = 'jkl_stock_additions';
const JKL_CHAL_COL = 'jkl_challans';
const JKL_MATERIALS = ['PPC', 'OPC43', 'Pro+'];

// Init
svc.init(JKL_CHAL_COL);

/* ── Overview ── */
router.get('/', async (req, res) => {
    try { res.json(await svc.getOverview(JKL_STOCK_COL, JKL_CHAL_COL)); }
    catch (e) { res.status(500).json({ error: e.message }); }
});

/* ── Stock Additions ── */
router.get('/additions', async (req, res) => {
    try { res.json(await svc.getHistory(JKL_STOCK_COL)); }
    catch (e) { res.status(500).json({ error: e.message }); }
});
router.post('/additions', async (req, res) => {
    try { res.status(201).json(await svc.addStock(req.body, JKL_STOCK_COL, JKL_MATERIALS)); }
    catch (e) { res.status(400).json({ error: e.message }); }
});
router.delete('/additions/:id', async (req, res) => {
    try { await svc.deleteAddition(req.params.id, JKL_STOCK_COL); res.json({ ok: true }); }
    catch (e) { res.status(404).json({ error: e.message }); }
});

/* ── Challans ── */
router.get('/challans', async (req, res) => {
    try { res.json(await svc.getAllChallans(JKL_CHAL_COL)); }
    catch (e) { res.status(500).json({ error: e.message }); }
});
router.post('/challans', async (req, res) => {
    try { res.status(201).json(await svc.createChallan(req.body, JKL_CHAL_COL, JKL_MATERIALS)); }
    catch (e) { res.status(400).json({ error: e.message }); }
});
router.post('/challans/deduct', async (req, res) => {
    try {
        const { id, deductions } = req.body;
        if (!id || !deductions) throw new Error('Missing deduct data');
        res.json(await svc.deductChallanQuantities(id, deductions, JKL_CHAL_COL));
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});
router.put('/challans/:id', async (req, res) => {
    try { res.json(await svc.updateChallan(req.params.id, req.body, JKL_CHAL_COL)); }
    catch (e) { res.status(400).json({ error: e.message }); }
});
router.patch('/challans/:id/status', async (req, res) => {
    try { res.json(await svc.updateChallanStatus(req.params.id, req.body.status, JKL_CHAL_COL)); }
    catch (e) { res.status(400).json({ error: e.message }); }
});
router.delete('/challans/:id', async (req, res) => {
    try { await svc.deleteChallan(req.params.id, JKL_CHAL_COL); res.json({ ok: true }); }
    catch (e) { res.status(404).json({ error: e.message }); }
});

router.post('/sync-lr', async (req, res) => {
    try {
        const { oldChallanNos, newChallanNos, material, quantity } = req.body;
        await svc.syncLRWithChallans(oldChallanNos, newChallanNos, material, quantity, JKL_CHAL_COL);
        res.json({ ok: true });
    } catch (e) { res.status(400).json({ error: e.message }); }
});

module.exports = router;
