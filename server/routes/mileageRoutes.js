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

        const cleanTruckNo = truckNo.replace(/\s/g, '').toUpperCase();
        const snapshot = await db.collection(getCol(BASE_COL, req)).get();

        const allDocs = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(d => (d.truckNo || '').replace(/\s/g, '').toUpperCase() === cleanTruckNo);

        if (allDocs.length === 0) return res.json({ endKm: null });

        // Get most recent doc with endKm set
        const docs = allDocs
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

        const cleanTruckNo = truckNo.replace(/\s/g, '').toUpperCase();
        const snapshot = await db.collection(getCol(BASE_COL, req)).get();
        
        let docs = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(d => (d.truckNo || '').replace(/\s/g, '').toUpperCase() === cleanTruckNo);

        docs = docs.sort((a, b) => {
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
            const cleanNo = d.truckNo.replace(/\s/g, '').toUpperCase();
            if (!byTruck[cleanNo]) byTruck[cleanNo] = [];
            byTruck[cleanNo].push(d);
        });

        const result = Object.entries(byTruck).map(([truckNo, trips]) => {
            const sortedAsc = [...trips].sort((a, b) => {
                const aTime = a.createdAt?.seconds || 0;
                const bTime = b.createdAt?.seconds || 0;
                if (a.date !== b.date) return (a.date || '').localeCompare(b.date || '');
                return aTime - bTime;
            });
            
            let lastEndKm = null;
            let totalKm = 0;
            let mileageTripCount = 0;
            let totalDiesel = 0;
            
            sortedAsc.forEach(t => {
                if (t.endKm && String(t.endKm).trim() !== '') {
                    const currKm = parseFloat(t.endKm);
                    if (lastEndKm !== null && currKm >= lastEndKm) {
                        totalKm += (currKm - lastEndKm);
                    }
                    lastEndKm = currKm;
                    mileageTripCount++;
                }
                totalDiesel += parseFloat(t.advanceDiesel) || 0;
            });

            const sortedDesc = [...sortedAsc].reverse();
            return {
                truckNo,
                tripCount: trips.length,
                mileageTripCount,
                totalKm: totalKm.toFixed(1),
                totalDieselRs: totalDiesel,
                lastEndKm: lastEndKm,
                lastDate: sortedDesc[0]?.date || null,
            };
        });

        res.json(result);
    } catch (err) {
        console.error('mileage all-vehicles error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/mileage/fuel
 * Returns ALL manual fuel logs (optionally filtered by ?truckNo=).
 */
router.get('/fuel', async (req, res) => {
    try {
        if (!isAvailable()) return res.json([]);
        let query = db.collection(getCol('fuel_logs', req));
        if (req.query.truckNo) {
            query = query.where('truckNo', '==', req.query.truckNo);
        }
        const snapshot = await query.get();
        const docs = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        res.json(docs);
    } catch (err) {
        console.error('get all fuel logs error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/mileage/fuel/:truckNo
 * Returns manual fuel logs for a specific truck.
 */
router.get('/fuel/:truckNo', async (req, res) => {
    const { truckNo } = req.params;
    try {
        if (!isAvailable()) return res.json([]);
        const snapshot = await db.collection(getCol('fuel_logs', req))
            .where('truckNo', '==', truckNo)
            .get();

        const docs = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .sort((a, b) => new Date(b.date) - new Date(a.date));

        res.json(docs);
    } catch (err) {
        console.error('get fuel logs error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/mileage/fuel
 * Adds a manual fuel log for a truck.
 */
router.post('/fuel', async (req, res) => {
    try {
        if (!isAvailable()) return res.status(400).json({ error: 'Database unavailable' });
        if (!req.body.truckNo) return res.status(400).json({ error: 'truckNo is required' });
        if (!req.body.litres || parseFloat(req.body.litres) <= 0) return res.status(400).json({ error: 'litres must be greater than 0' });
        
        const payload = {
            ...req.body,
            litres: parseFloat(req.body.litres),
            createdAt: new Date().toISOString()
        };
        
        const docRef = await db.collection(getCol('fuel_logs', req)).add(payload);
        res.json({ id: docRef.id, ...payload });
    } catch (err) {
        console.error('add fuel log error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * DELETE /api/mileage/fuel/:id
 * Deletes a manual fuel log by its document ID.
 */
router.delete('/fuel/:id', async (req, res) => {
    try {
        if (!isAvailable()) return res.status(400).json({ error: 'Database unavailable' });
        await db.collection(getCol('fuel_logs', req)).doc(req.params.id).delete();
        res.json({ message: 'Fuel log deleted' });
    } catch (err) {
        console.error('delete fuel log error:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
