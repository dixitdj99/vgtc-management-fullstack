const express = require('express');
const router = express.Router();
const advanceService = require('../services/vehicleAdvanceService');
const { getCol } = require('../utils/collectionUtils');

const BASE_COL = 'vehicle_advances';

// Create advance transaction
router.post('/', async (req, res) => {
    try {
        const result = await advanceService.createAdvance(req.body, getCol(BASE_COL, req));
        res.status(201).json(result);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Get all advances (for summary/overview)
router.get('/', async (req, res) => {
    try {
        const advances = await advanceService.getAllAdvances(getCol(BASE_COL, req));
        res.json(advances);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get advances for specific truck
router.get('/:truckNo', async (req, res) => {
    try {
        const advances = await advanceService.getAdvancesByTruck(req.params.truckNo, getCol(BASE_COL, req));
        res.json(advances);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete advance (admin only)
router.delete('/:id', async (req, res) => {
    try {
        await advanceService.deleteAdvance(req.params.id, getCol(BASE_COL, req));
        res.json({ message: 'Advance deleted' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
