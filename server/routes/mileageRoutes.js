const express = require('express');
const router = express.Router();
const { db, isAvailable } = require('../firebase');
const { getCol } = require('../utils/collectionUtils');
const localStore = require('../utils/localStore');
const { tenancyMiddleware } = require('../middleware/tenancyMiddleware');
const { requireAuth } = require('../middleware/auth');

// Apply tenancy to all routes in this router
router.use(requireAuth, tenancyMiddleware);

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
            docs = localStore.getAll(BASE_COL).filter(d => d.orgId === req.orgId && (d.truckNo || '').replace(/\s/g, '').toUpperCase() === cleanTruckNo);
            docs = docs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        } else {
            const snapshot = await db.collection(getCol(BASE_COL, req)).where('orgId', '==', req.orgId).get();
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
            const vouchers = localStore.getAll(BASE_COL).filter(v => v.orgId === req.orgId);
            const fuelLogs = localStore.getAll('fuel_logs').filter(f => f.orgId === req.orgId);
            allDocs = [
                ...vouchers.map(d => ({ ...d, _type: 'voucher' })),
                ...fuelLogs.map(d => ({ ...d, _type: 'fuel_log' }))
            ];
        } else {
            const [vouchersSnap, fuelSnap] = await Promise.all([
                db.collection(getCol(BASE_COL, req)).where('orgId', '==', req.orgId).get(),
                db.collection(getCol('fuel_logs', req)).where('orgId', '==', req.orgId).get()
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

const mileageService = require('../services/mileageService');

/**
 * GET /api/mileage/all-vehicles
 * Returns summary stats per truck across all voucher types.
 */
router.get('/all-vehicles', async (req, res) => {
    try {
        const result = await mileageService.calculateMileageSummary(req.orgId, req);
        const arrayResult = Object.entries(result).map(([truckNo, stats]) => ({
            truckNo,
            ...stats
        }));
        return res.json(arrayResult);
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
            let query = localStore.getAll('fuel_logs').filter(f => f.orgId === req.orgId);
            if (req.query.truckNo) {
                query = query.filter(d => d.truckNo === req.query.truckNo);
            }
            docs = query.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        } else {
            let query = db.collection(getCol('fuel_logs', req)).where('orgId', '==', req.orgId);
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
                .filter(d => d.orgId === req.orgId && d.truckNo === truckNo)
                .sort((a, b) => new Date(b.date) - new Date(a.date));
        } else {
            const snapshot = await db.collection(getCol('fuel_logs', req))
                .where('orgId', '==', req.orgId)
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
        if (!req.body.truckNo) return res.status(400).json({ error: 'truckNo is required' });

        const payload = {
            ...req.body,
            orgId: req.orgId,
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
 * GET /api/mileage/settings
 * Get fuel rate settings (diesel ₹/L, CNG ₹/kg)
 */
router.get('/settings', async (req, res) => {
    try {
        let doc = null;
        if (!isAvailable()) {
            const docs = localStore.getAll('mileage_settings').filter(d => d.orgId === req.orgId);
            doc = docs[0];
        } else {
            const snapshot = await db.collection(getCol('mileage_settings', req))
                .where('orgId', '==', req.orgId)
                .limit(1)
                .get();
            if (!snapshot.empty) doc = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
        }

        const defaults = { dieselPerLitre: 90, cngPerKg: 75 };
        if (doc) {
            res.json({
                id: doc.id,
                dieselPerLitre: doc.dieselPerLitre || 90,
                cngPerKg: doc.cngPerKg || 75,
                updatedAt: doc.updatedAt
            });
        } else {
            res.json(defaults);
        }
    } catch (err) {
        console.error('get mileage settings error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/mileage/settings
 * Update fuel rate settings
 */
router.post('/settings', async (req, res) => {
    try {
        console.log('[mileage/settings POST] Received:', req.body, 'orgId:', req.orgId);
        const { dieselPerLitre, cngPerKg } = req.body;

        if (dieselPerLitre === undefined || cngPerKg === undefined) {
            console.log('Missing required fields');
            return res.status(400).json({ error: 'dieselPerLitre and cngPerKg required', received: req.body });
        }

        const d = parseFloat(dieselPerLitre);
        const c = parseFloat(cngPerKg);
        if (isNaN(d) || isNaN(c) || d <= 0 || c <= 0) {
            console.log('Invalid numeric values:', { d, c });
            return res.status(400).json({ error: 'Rates must be positive numbers', received: { dieselPerLitre: d, cngPerKg: c } });
        }

        const payload = {
            orgId: req.orgId,
            dieselPerLitre: d,
            cngPerKg: c,
            updatedAt: new Date().toISOString()
        };

        console.log('[mileage/settings] Saving payload:', payload, 'Firebase available:', isAvailable());

        if (!isAvailable()) {
            const docs = localStore.getAll('mileage_settings').filter(doc => doc.orgId === req.orgId);
            console.log('[mileage/settings] Found local docs:', docs.length);
            if (docs.length > 0) {
                localStore.update('mileage_settings', docs[0].id, payload);
                console.log('[mileage/settings] Updated doc:', docs[0].id);
                return res.json({ id: docs[0].id, dieselPerLitre: d, cngPerKg: c, updatedAt: payload.updatedAt });
            } else {
                const doc = localStore.insert('mileage_settings', payload);
                console.log('[mileage/settings] Inserted new doc:', doc.id);
                return res.json({ id: doc.id, dieselPerLitre: d, cngPerKg: c, updatedAt: payload.updatedAt });
            }
        } else {
            const snapshot = await db.collection(getCol('mileage_settings', req))
                .where('orgId', '==', req.orgId)
                .limit(1)
                .get();

            console.log('[mileage/settings] Firestore docs found:', !snapshot.empty);
            let docId;
            if (!snapshot.empty) {
                docId = snapshot.docs[0].id;
                await db.collection(getCol('mileage_settings', req)).doc(docId).update(payload);
                console.log('[mileage/settings] Updated Firestore doc:', docId);
            } else {
                const docRef = await db.collection(getCol('mileage_settings', req)).add(payload);
                docId = docRef.id;
                console.log('[mileage/settings] Created new Firestore doc:', docId);
            }
            return res.json({ id: docId, dieselPerLitre: d, cngPerKg: c, updatedAt: payload.updatedAt });
        }
    } catch (err) {
        console.error('[mileage/settings] Error:', err);
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
