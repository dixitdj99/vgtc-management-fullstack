const express = require('express');
const router = express.Router();
const advanceService = require('../services/vehicleAdvanceService');
const { getCol } = require('../utils/collectionUtils');
const { tenancyMiddleware } = require('../middleware/tenancyMiddleware');
const { requireAuth } = require('../middleware/auth');
const cashbookService = require('../utils/cashbookService');

// Apply tenancy to all routes in this router
router.use(requireAuth, tenancyMiddleware);

const BASE_COL = 'vehicle_advances';
const CASHBOOK_COL = 'cashbook';

/**
 * Resolves which cashbook collection to write to.
 * The frontend sends cashbookType: 'jkl' for JK Lakshmi, else JK Super.
 * This ensures vehicle advance deposits/cash-outs land in the right cashbook.
 */
const getCashbookCol = (req) => {
    const cbType = req.body?.cashbookType || req.query?.cashbookType || 'dump';
    const baseCb = cbType === 'jkl' ? 'jkl_cashbook' : 'cashbook';
    return getCol(baseCb, req);
};

// Create advance transaction
router.post('/', async (req, res) => {
    try {
        const result = await advanceService.createAdvance(
            req.orgId,
            req.body,
            getCol(BASE_COL, req),
            getCashbookCol(req)   // ← correct cashbook (JKL or JK Super)
        );

        res.status(201).json(result);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Clear advances for a vehicle payout
router.post('/clear', async (req, res) => {
    try {
        const { truckNo, paymentId, advanceIds, amount, driverMobile, driverContact } = req.body;
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

// ── Return credit to owner ────────────────────────────────────────────────────
// POST /api/vehicle-advances/:id/return
// Takes a credit advance that has NOT been cleared yet and:
//   1. Creates a cashbook cash_out (money going back to owner)
//   2. Marks the advance as isCleared = true
// Both operations are linked by ID for a full audit trail.
router.post('/:id/return', async (req, res) => {
    try {
        const { date, remark } = req.body;
        const result = await advanceService.returnCreditToOwner(
            req.orgId,
            req.params.id,
            getCol(BASE_COL, req),
            getCashbookCol(req),   // ← correct cashbook (JKL or JK Super)
            { date, remark }
        );

        res.json(result);
    } catch (error) {
        const status = error.message.includes('not found') ? 404
            : error.message.includes('already') ? 409
            : 400;
        res.status(status).json({ error: error.message });
    }
});

module.exports = router;
