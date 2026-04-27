const express = require('express');
const router = express.Router();
const { db, isAvailable } = require('../firebase');
const { getCol } = require('../utils/collectionUtils');
const localStore = require('../utils/localStore');

const BASE_COL = 'vouchers';

/**
 * GET /api/mileage/last-km/:truckNo
 * Returns the endKm of the most recent voucher (any type) for a truck.
 */
router.get('/last-km/:truckNo', async (req, res) => {
    const { truckNo } = req.params;
    try {
        let docs = [];
        const cleanTruckNo = truckNo.replace(/\s/g, '').toUpperCase();
        
        if (!isAvailable()) {
            docs = localStore.getAll(BASE_COL).filter(d => (d.truckNo || '').replace(/\s/g, '').toUpperCase() === cleanTruckNo);
            docs = docs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        } else {
            const snapshot = await db.collection(getCol(BASE_COL, req)).get();
            docs = snapshot.docs
                .map(doc => ({ id: doc.id, ...doc.data() }))
                .filter(d => (d.truckNo || '').replace(/\s/g, '').toUpperCase() === cleanTruckNo);
            docs = docs.sort((a, b) => {
                const aT = a.createdAt?.seconds || 0;
                const bT = b.createdAt?.seconds || 0;
                return bT - aT;
            });
        }

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
        const cleanTruckNo = truckNo.replace(/\s/g, '').toUpperCase();
        let allDocs = [];

        if (!isAvailable()) {
            const vouchers = localStore.getAll(BASE_COL);
            const fuelLogs = localStore.getAll('fuel_logs');
            allDocs = [
                ...vouchers.map(d => ({ ...d, _type: 'voucher' })),
                ...fuelLogs.map(d => ({ ...d, _type: 'fuel_log' }))
            ];
        } else {
            const [vouchersSnap, fuelSnap] = await Promise.all([
                db.collection(getCol(BASE_COL, req)).get(),
                db.collection(getCol('fuel_logs', req)).get()
            ]);
            allDocs = [
                ...vouchersSnap.docs.map(doc => ({ id: doc.id, ...doc.data(), _type: 'voucher' })),
                ...fuelSnap.docs.map(doc => ({ id: doc.id, ...doc.data(), _type: 'fuel_log' }))
            ];
        }

        let docs = allDocs.filter(d => (d.truckNo || '').replace(/\s/g, '').toUpperCase() === cleanTruckNo);

        const getTime = (c) => {
            if (!c) return 0;
            if (c.seconds) return c.seconds * 1000;
            return new Date(c).getTime() || 0;
        };

        docs = docs.sort((a, b) => getTime(b.createdAt) - getTime(a.createdAt));

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
        let allDocs = [];

        if (!isAvailable()) {
            const vouchers = localStore.getAll(BASE_COL);
            const fuelLogs = localStore.getAll('fuel_logs');
            allDocs = [
                ...vouchers.map(d => ({ ...d, _type: 'voucher' })),
                ...fuelLogs.map(d => ({ ...d, _type: 'fuel_log' }))
            ];
        } else {
            const [vouchersSnap, fuelSnap] = await Promise.all([
                db.collection(getCol(BASE_COL, req)).get(),
                db.collection(getCol('fuel_logs', req)).get()
            ]);
            
            allDocs = [
                ...vouchersSnap.docs.map(doc => ({ id: doc.id, ...doc.data(), _type: 'voucher' })),
                ...fuelSnap.docs.map(doc => ({ id: doc.id, ...doc.data(), _type: 'fuel_log' }))
            ];
        }

        const byTruck = {};
        allDocs.forEach(doc => {
            if (!doc.truckNo) return;
            const cleanNo = doc.truckNo.replace(/\s/g, '').toUpperCase();
            if (!byTruck[cleanNo]) byTruck[cleanNo] = [];
            byTruck[cleanNo].push(doc);
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
                const amt = parseFloat(t.advanceDiesel) || parseFloat(t.amount) || 0;
                totalDiesel += amt;
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
        let docs = [];
        if (!isAvailable()) {
            let query = localStore.getAll('fuel_logs');
            if (req.query.truckNo) {
                query = query.filter(d => d.truckNo === req.query.truckNo);
            }
            docs = query.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        } else {
            let query = db.collection(getCol('fuel_logs', req));
            if (req.query.truckNo) {
                query = query.where('truckNo', '==', req.query.truckNo);
            }
            const snapshot = await query.get();
            docs = snapshot.docs
                .map(doc => ({ id: doc.id, ...doc.data() }))
                .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        }
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
        let docs = [];
        if (!isAvailable()) {
            docs = localStore.getAll('fuel_logs')
                .filter(d => d.truckNo === truckNo)
                .sort((a, b) => new Date(b.date) - new Date(a.date));
        } else {
            const snapshot = await db.collection(getCol('fuel_logs', req))
                .where('truckNo', '==', truckNo)
                .get();

            docs = snapshot.docs
                .map(doc => ({ id: doc.id, ...doc.data() }))
                .sort((a, b) => new Date(b.date) - new Date(a.date));
        }

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
        
        const payload = {
            ...req.body,
            createdAt: new Date().toISOString()
        };
        
        let docRefId;
        if (!isAvailable()) {
            const doc = localStore.insert('fuel_logs', payload);
            docRefId = doc.id;
        } else {
            const docRef = await db.collection(getCol('fuel_logs', req)).add(payload);
            docRefId = docRef.id;
        }
        res.json({ id: docRefId, ...payload });
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
        if (!isAvailable()) {
            localStore.delete('fuel_logs', req.params.id);
        } else {
            await db.collection(getCol('fuel_logs', req)).doc(req.params.id).delete();
        }
        res.json({ message: 'Fuel log deleted' });
    } catch (err) {
        console.error('delete fuel log error:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
