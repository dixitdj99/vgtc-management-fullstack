const express = require('express');
const router = express.Router();
const svc = require('../utils/stockService');

/* ── Stock Additions ── */
router.get('/additions', async (req, res) => {
    try { res.json(await svc.getAllAdditions()); }
    catch (e) { res.status(500).json({ error: e.message }); }
});
router.post('/additions', async (req, res) => {
    try { res.status(201).json(await svc.addStock(req.body)); }
    catch (e) { res.status(400).json({ error: e.message }); }
});
router.delete('/additions/:id', async (req, res) => {
    try { await svc.deleteAddition(req.params.id); res.json({ ok: true }); }
    catch (e) { res.status(404).json({ error: e.message }); }
});

/* ── Challans ── */
router.get('/challans', async (req, res) => {
    try { res.json(await svc.getAllChallans()); }
    catch (e) { res.status(500).json({ error: e.message }); }
});
router.post('/challans', async (req, res) => {
    try { res.status(201).json(await svc.createChallan(req.body)); }
    catch (e) { res.status(400).json({ error: e.message }); }
});
router.post('/challans/deduct', async (req, res) => {
    try {
        const { id, deductions } = req.body; // Changed from challanNo to id for Firestore consistency
        if (!id || !deductions) throw new Error('Missing deduct data');
        res.json(await svc.deductChallanQuantities(id, deductions));
    } catch (e) { res.status(400).json({ error: e.message }); }
});
router.patch('/challans/:id', async (req, res) => {
    try { res.json(await svc.updateChallanStatus(req.params.id, req.body.status)); }
    catch (e) { res.status(400).json({ error: e.message }); }
});
router.delete('/challans/:id', async (req, res) => {
    try { await svc.deleteChallan(req.params.id); res.json({ ok: true }); }
    catch (e) { res.status(404).json({ error: e.message }); }
});

/* ── Meta ── */
router.get('/materials', (req, res) => res.json(svc.MATERIALS));

module.exports = router;
