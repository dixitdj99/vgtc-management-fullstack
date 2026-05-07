const express = require('express');
const router = express.Router();
const svc = require('../utils/stockService');
const { getCol } = require('../utils/collectionUtils');
const { tenancyMiddleware } = require('../middleware/tenancyMiddleware');
const { requireAuth } = require('../middleware/auth');

// Apply tenancy to all routes in this router
router.use(requireAuth, tenancyMiddleware);

const SCOL = 'stock_additions';
const CCOL = 'challans';
const MCOL = 'materials';

const sheetsService = require('../utils/sheetsService');

/* ── Stock Additions ── */
router.get('/additions', async (req, res) => {
    try { res.json(await svc.getAllAdditions(req.orgId, getCol(SCOL, req))); }
    catch (e) { res.status(500).json({ error: e.message }); }
});
router.post('/additions', async (req, res) => {
    try { 
        const doc = await svc.addStock(req.orgId, req.body, getCol(SCOL, req), getCol(MCOL, req));
        sheetsService.upsertStockMigo(doc, 'jksuper').catch(err => console.error('[Backup Hook] MIGO upsert failed:', err.message));
        res.status(201).json(doc);
    }
    catch (e) { res.status(400).json({ error: e.message }); }
});
router.delete('/additions/:id', async (req, res) => {
    try { 
        await svc.deleteAddition(req.params.id, getCol(SCOL, req)); 
        sheetsService.deleteStockMigo(req.params.id, 'jksuper').catch(err => console.error('[Backup Hook] MIGO delete failed:', err.message));
        res.json({ ok: true }); 
    }
    catch (e) { res.status(404).json({ error: e.message }); }
});

/* ── Challans ── */
router.get('/challans', async (req, res) => {
    try { res.json(await svc.getAllChallans(req.orgId, getCol(CCOL, req))); }
    catch (e) { res.status(500).json({ error: e.message }); }
});
router.post('/challans', async (req, res) => {
    try { 
        const doc = await svc.createChallan(req.orgId, req.body, getCol(CCOL, req), getCol(MCOL, req));
        sheetsService.upsertStockChallan(doc, 'jksuper').catch(err => console.error('[Backup Hook] Challan upsert failed:', err.message));
        res.status(201).json(doc);
    }
    catch (e) { res.status(400).json({ error: e.message }); }
});
router.post('/challans/deduct', async (req, res) => {
    try {
        const { id, deductions } = req.body; 
        if (!id || !deductions) throw new Error('Missing deduct data');
        const doc = await svc.deductChallanQuantities(id, deductions, getCol(CCOL, req));
        sheetsService.upsertStockChallan(doc, 'jksuper').catch(err => console.error('[Backup Hook] Challan deduction upsert failed:', err.message));
        res.json(doc);
    } catch (e) { res.status(400).json({ error: e.message }); }
});
router.patch('/challans/:id', async (req, res) => {
    try { 
        await svc.updateChallanStatus(req.params.id, req.body.status, getCol(CCOL, req));
        const all = await svc.getAllChallans(req.orgId, getCol(CCOL, req));
        const doc = all.find(c => c.id === req.params.id);
        if (doc) {
            sheetsService.upsertStockChallan(doc, 'jksuper').catch(err => console.error('[Backup Hook] Challan status upsert failed:', err.message));
        }
        res.json(doc); 
    }
    catch (e) { res.status(400).json({ error: e.message }); }
});
router.delete('/challans/:id', async (req, res) => {
    try { 
        await svc.deleteChallan(req.params.id, getCol(CCOL, req)); 
        sheetsService.deleteStockChallan(req.params.id, 'jksuper').catch(err => console.error('[Backup Hook] Challan delete failed:', err.message));
        res.json({ ok: true }); 
    }
    catch (e) { res.status(404).json({ error: e.message }); }
});

/* ── Meta & Materials ── */
router.get('/materials/list', async (req, res) => {
    try { res.json(await svc.getMaterialsList(req.orgId, getCol(MCOL, req))); }
    catch (e) { res.status(500).json({ error: e.message }); }
});
router.post('/materials', async (req, res) => {
    try { res.status(201).json(await svc.addMaterial(req.orgId, req.body.name, getCol(MCOL, req))); }
    catch (e) { res.status(400).json({ error: e.message }); }
});
router.delete('/materials/:id', async (req, res) => {
    try { await svc.deleteMaterial(req.params.id, getCol(MCOL, req)); res.json({ ok: true }); }
    catch (e) { res.status(404).json({ error: e.message }); }
});

router.get('/materials', (req, res) => res.json(svc.MATERIALS));

router.post('/sync-lr', async (req, res) => {
    try {
        const { oldChallanNos, newChallanNos, material, quantity } = req.body;
        await svc.syncLRWithChallans(req.orgId, oldChallanNos, newChallanNos, material, quantity, getCol(CCOL, req));
        res.json({ ok: true });
    } catch (e) { res.status(400).json({ error: e.message }); }
});

module.exports = router;
