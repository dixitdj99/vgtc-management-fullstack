const express = require('express');
const router = express.Router();
const svc = require('../utils/sellService');
const { getCol } = require('../utils/collectionUtils');
const BASE_COL = 'sales';

// GET /api/sell?brand=dump
router.get('/', async (req, res) => {
    try {
        const brand = req.query.brand || 'dump';
        const data = await svc.getAll(getCol(BASE_COL, req));
        // Filter by brand if needed, or return all and let frontend decide
        const filtered = data.filter(d => d.brand === brand);
        res.json(filtered);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/sell
router.post('/', async (req, res) => {
    try {
        const doc = await svc.addSale(req.body, getCol(BASE_COL, req));
        res.status(201).json(doc);
    } catch (e) { res.status(400).json({ error: e.message }); }
});

// PATCH /api/sell/:id
router.patch('/:id', async (req, res) => {
    try {
        const doc = await svc.updateSale(req.params.id, req.body, getCol(BASE_COL, req));
        res.json(doc);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/sell/:id
router.delete('/:id', async (req, res) => {
    try {
        await svc.deleteSale(req.params.id, 'dump', getCol(BASE_COL, req));
        res.json({ message: 'Deleted' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
