const express = require('express');
const router = express.Router();
const { db, isAvailable } = require('../firebase');
const { getCol } = require('../utils/collectionUtils');

const BASE_COL = 'vouchers';

/**
 * GET /api/mileage/last-km/:truckNo
 * Returns the endKm of the most recent voucher (any type) for a truck.
 */
router.get('/last-km/:truckNo', async (req, res) => {
    const { truckNo } = req.params;
    try {
        if (!isAvailable()) return res.json({ endKm: null });

        const snapshot = await db.collection(getCol(BASE_COL, req))
            .where('truckNo', '==', truckNo)
            .get();

        if (snapshot.empty) return res.json({ endKm: null });

        // Get most recent doc with endKm set
        const docs = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(d => d.endKm != null && d.endKm !== '')
            .sort((a, b) => {
                const aT = a.createdAt?.seconds || 0;
                const bT = b.createdAt?.seconds || 0;
                return bT - aT;
            });

        if (docs.length === 0) return res.json({ endKm: null });

        return res.json({ endKm: docs[0].endKm, lrNo: docs[0].lrNo, date: docs[0].date });
    } catch (err) {
        console.error('mileage last-km error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/mileage/vehicle/:truckNo
 * Returns all vouchers (any type) for a truck, for the mileage trip table.
 */
router.get('/vehicle/:truckNo', async (req, res) => {
    const { truckNo } = req.params;
    try {
        if (!isAvailable()) return res.json([]);

        const snapshot = await db.collection(getCol(BASE_COL, req))
            .where('truckNo', '==', truckNo)
            .get();

        const docs = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .sort((a, b) => {
                const aT = a.createdAt?.seconds || 0;
                const bT = b.createdAt?.seconds || 0;
                return bT - aT;
            });

        return res.json(docs);
    } catch (err) {
        console.error('mileage vehicle error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/mileage/all-vehicles
 * Returns summary stats per truck across all voucher types.
 */
router.get('/all-vehicles', async (req, res) => {
    try {
        if (!isAvailable()) return res.json([]);

        const snapshot = await db.collection(getCol(BASE_COL, req)).get();

        const byTruck = {};
        snapshot.docs.forEach(doc => {
            const d = { id: doc.id, ...doc.data() };
            if (!d.truckNo) return;
            if (!byTruck[d.truckNo]) byTruck[d.truckNo] = [];
            byTruck[d.truckNo].push(d);
        });

        const result = Object.entries(byTruck).map(([truckNo, trips]) => {
            const mileageTrips = trips.filter(t => t.startKm != null && t.endKm != null && t.endKm !== '' && t.startKm !== '');
            const totalKm = mileageTrips.reduce((s, t) => s + (parseFloat(t.endKm) - parseFloat(t.startKm)), 0);
            const totalDiesel = mileageTrips.reduce((s, t) => s + (parseFloat(t.advanceDiesel) || 0), 0);
            const sorted = [...trips].sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
            return {
                truckNo,
                tripCount: trips.length,
                mileageTripCount: mileageTrips.length,
                totalKm: totalKm.toFixed(1),
                totalDieselRs: totalDiesel,
                lastEndKm: sorted.find(t => t.endKm)?.endKm || null,
                lastDate: sorted[0]?.date || null,
            };
        });

        res.json(result);
    } catch (err) {
        console.error('mileage all-vehicles error:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
