const express = require('express');
const router = express.Router();
const destinationService = require('../services/destinationService');
const { requireAuth } = require('../middleware/auth');
const { tenancyMiddleware } = require('../middleware/tenancyMiddleware');

router.use(requireAuth, tenancyMiddleware);

// GET /api/destinations — List all destinations
router.get('/', async (req, res) => {
    try {
        const destinations = await destinationService.getAllDestinations(req.orgId);
        res.json(destinations);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/destinations/rate-lookup?name=Rewari&date=2026-08-11 — Lookup rate for destination on date
router.get('/rate-lookup', async (req, res) => {
    try {
        const { name, date } = req.query;
        if (!name) return res.json({ rate: 0 });
        const rate = await destinationService.getRateForDate(req.orgId, name, date);
        res.json({ name, date, rate });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/destinations — Create new destination
router.post('/', async (req, res) => {
    try {
        const destination = await destinationService.createDestination(req.orgId, req.body);
        res.status(201).json(destination);
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

// POST /api/destinations/record — Auto-record destination from voucher if new
router.post('/record', async (req, res) => {
    try {
        const destination = await destinationService.autoRecordDestination(req.orgId, req.body);
        res.json({ recorded: !!destination, destination });
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

// PATCH /api/destinations/:id — Update destination details / rate history
router.patch('/:id', async (req, res) => {
    try {
        const updated = await destinationService.updateDestination(req.orgId, req.params.id, req.body);
        res.json(updated);
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

// POST /api/destinations/:id/rate-period — Add a new effective rate period
router.post('/:id/rate-period', async (req, res) => {
    try {
        const updated = await destinationService.addRatePeriod(req.orgId, req.params.id, req.body);
        res.json(updated);
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

// DELETE /api/destinations/:id — Delete destination
router.delete('/:id', async (req, res) => {
    try {
        const result = await destinationService.deleteDestination(req.params.id);
        res.json(result);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
