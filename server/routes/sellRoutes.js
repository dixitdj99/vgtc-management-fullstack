const express = require('express');
const router = express.Router();
const svc = require('../utils/sellService');

// GET /api/sell?brand=dump
router.get('/', async (req, res) => {
    try {
        const brand = req.query.brand || 'dump';
        const data = await svc.getAll();
        // Filter by brand if needed, or return all and let frontend decide
        const filtered = data.filter(d => d.brand === brand);
        res.json(filtered);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/sell
router.post('/', async (req, res) => {
    try {
        const doc = await svc.addSale(req.body);
        res.status(201).json(doc);
    } catch (e) { res.status(400).json({ error: e.message }); }
});

// DELETE /api/sell/:id
router.delete('/:id', async (req, res) => {
    try {
        await svc.deleteSale(req.params.id);
        res.json({ message: 'Deleted' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
