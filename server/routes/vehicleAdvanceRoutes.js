const express = require('express');
const router = express.Router();
const advanceService = require('../services/vehicleAdvanceService');
const { getCol } = require('../utils/collectionUtils');
const { tenancyMiddleware } = require('../middleware/tenancyMiddleware');
const { requireAuth } = require('../middleware/auth');

// Apply tenancy to all routes in this router
router.use(requireAuth, tenancyMiddleware);

const BASE_COL = 'vehicle_advances';
const CASHBOOK_COL = 'cashbook';

// Create advance transaction
router.post('/', async (req, res) => {
    try {
        const result = await advanceService.createAdvance(
            req.orgId,
            req.body,
            getCol(BASE_COL, req),
            getCol(CASHBOOK_COL, req)
        );
        res.status(201).json(result);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Clear advances for a vehicle payout
router.post('/clear', async (req, res) => {
    try {
        const { truckNo, paymentId, advanceIds } = req.body;
        if (!truckNo) return res.status(400).json({ error: 'Truck number required' });
        const result = await advanceService.clearAdvancesForTruck(
            req.orgId,
            truckNo,
            paymentId,
            advanceIds || [],
            getCol(BASE_COL, req)
        );
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get all advances (for summary/overview)
router.get('/', async (req, res) => {
    try {
        let advances = await advanceService.getAllAdvances(req.orgId, getCol(BASE_COL, req));
        if (req.query.status === 'uncleared') {
            advances = advances.filter(a => !a.isCleared);
        } else if (req.query.status === 'cleared') {
            advances = advances.filter(a => a.isCleared);
        }
        res.json(advances);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get advances for specific truck
router.get('/:truckNo', async (req, res) => {
    try {
        let advances = await advanceService.getAdvancesByTruck(req.orgId, req.params.truckNo, getCol(BASE_COL, req));
        if (req.query.status === 'uncleared') {
            advances = advances.filter(a => !a.isCleared);
        } else if (req.query.status === 'cleared') {
            advances = advances.filter(a => a.isCleared);
        }
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
