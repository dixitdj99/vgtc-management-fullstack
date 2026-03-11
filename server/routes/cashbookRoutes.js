const express = require('express');
const router = express.Router();
const svc = require('../utils/cashbookService');


// GET  /api/cashbook
router.get('/', async (req, res) => {
    try {
        const data = await svc.getAll();
        res.json(data);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/cashbook/deposit
router.post('/deposit', async (req, res) => {
    const { amount, remark, date } = req.body;
    try {
        const doc = await svc.addEntry('deposit', amount, remark, date);
        res.status(201).json(doc);
    } catch (e) { res.status(400).json({ error: e.message }); }
});

// POST /api/cashbook/cash-out
router.post('/cash-out', async (req, res) => {
    const { amount, remark, date } = req.body;
    try {
        const doc = await svc.addEntry('cash_out', amount, remark, date);
        res.status(201).json(doc);
    } catch (e) { res.status(400).json({ error: e.message }); }
});

// DELETE /api/cashbook/:id
router.delete('/:id', async (req, res) => {
    try {
        await svc.deleteEntry(req.params.id);
        res.json({ message: 'Deleted' });
    } catch (e) { res.status(404).json({ error: e.message }); }
});

module.exports = router;
