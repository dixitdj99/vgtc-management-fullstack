const express = require('express');
const router = express.Router();
const partyService = require('../services/partyService');

// Require authentication middleware (assuming it exists and is used globally or here)
const { requireAuth } = require('../middleware/auth');
router.use(requireAuth);

// GET /api/parties
router.get('/', async (req, res) => {
    try {
        const parties = await partyService.getAllParties();
        res.json(parties);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/parties
router.post('/', async (req, res) => {
    try {
        const party = await partyService.createParty(req.body);
        res.status(201).json(party);
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

// PATCH /api/parties/:id
router.patch('/:id', async (req, res) => {
    try {
        await partyService.updateParty(req.params.id, req.body);
        res.json({ message: 'Party updated successfully' });
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

// DELETE /api/parties/:id
router.delete('/:id', async (req, res) => {
    try {
        await partyService.deleteParty(req.params.id);
        res.json({ message: 'Party deleted successfully' });
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

module.exports = router;
