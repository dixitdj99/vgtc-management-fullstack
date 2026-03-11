const express = require('express');
const router = express.Router();
const svc = require('../utils/stockService');

/* ── Stock Additions ── */
router.get('/additions', (req, res) => res.json(svc.getAllAdditions()));
router.post('/additions', (req, res) => {
    try { res.status(201).json(svc.addStock(req.body)); }
    catch (e) { res.status(400).json({ error: e.message }); }
});
router.delete('/additions/:id', (req, res) => {
    try { svc.deleteAddition(req.params.id); res.json({ ok: true }); }
    catch (e) { res.status(404).json({ error: e.message }); }
});

/* ── Challans ── */
router.get('/challans', (req, res) => res.json(svc.getAllChallans()));
router.post('/challans', (req, res) => {
    try { res.status(201).json(svc.createChallan(req.body)); }
    catch (e) { res.status(400).json({ error: e.message }); }
});
router.post('/challans/deduct', (req, res) => {
    try {
        const { challanNo, deductions } = req.body;
        if (!challanNo || !deductions) throw new Error('Missing deduct data');
        res.json(svc.deductChallanQuantities(challanNo, deductions));
    } catch (e) { res.status(400).json({ error: e.message }); }
});
router.patch('/challans/:id', (req, res) => {
    try { res.json(svc.updateChallanStatus(req.params.id, req.body.status)); }
    catch (e) { res.status(400).json({ error: e.message }); }
});
router.delete('/challans/:id', (req, res) => {
    try { svc.deleteChallan(req.params.id); res.json({ ok: true }); }
    catch (e) { res.status(404).json({ error: e.message }); }
});

/* ── Meta ── */
router.get('/materials', (req, res) => res.json(svc.MATERIALS));

module.exports = router;
