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
router.get('/', (req, res) => res.json(svc.getOverview(JKL_STOCK_COL, JKL_CHAL_COL)));

/* ── Stock Additions ── */
router.get('/additions', (req, res) => res.json(svc.getHistory(JKL_STOCK_COL)));
router.post('/additions', (req, res) => {
    try { res.status(201).json(svc.addStock(req.body, JKL_STOCK_COL, JKL_MATERIALS)); }
    catch (e) { res.status(400).json({ error: e.message }); }
});
router.delete('/additions/:id', (req, res) => {
    try { svc.deleteAddition(req.params.id, JKL_STOCK_COL); res.json({ ok: true }); }
    catch (e) { res.status(404).json({ error: e.message }); }
});

/* ── Challans ── */
router.get('/challans', (req, res) => res.json(svc.getAllChallans(JKL_CHAL_COL)));
router.post('/challans', (req, res) => {
    try { res.status(201).json(svc.createChallan(req.body, JKL_CHAL_COL, JKL_MATERIALS)); }
    catch (e) { res.status(400).json({ error: e.message }); }
});
router.post('/challans/deduct', (req, res) => {
    try {
        const { challanNo, deductions } = req.body;
        if (!challanNo || !deductions) throw new Error('Missing deduct data');
        res.json(svc.deductChallanQuantities(challanNo, deductions, JKL_CHAL_COL));
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});
router.put('/challans/:id', (req, res) => {
    try { res.json(svc.updateChallan(req.params.id, req.body, JKL_CHAL_COL)); }
    catch (e) { res.status(400).json({ error: e.message }); }
});
router.patch('/challans/:id/status', (req, res) => {
    try { res.json(svc.updateChallanStatus(req.params.id, req.body.status, JKL_CHAL_COL)); }
    catch (e) { res.status(400).json({ error: e.message }); }
});
router.delete('/challans/:id', (req, res) => {
    try { svc.deleteChallan(req.params.id, JKL_CHAL_COL); res.json({ ok: true }); }
    catch (e) { res.status(404).json({ error: e.message }); }
});

module.exports = router;
