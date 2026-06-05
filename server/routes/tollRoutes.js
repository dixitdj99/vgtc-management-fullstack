const express = require('express');
const router = express.Router();
const { getCol } = require('../utils/collectionUtils');
const { tenancyMiddleware } = require('../middleware/tenancyMiddleware');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth, tenancyMiddleware);

const BASE_COL = 'vehicle_tolls';

// GET all tolls (optional ?from=&to=&truckNo= query params)
router.get('/', async (req, res) => {
    try {
        const { db, isAvailable } = require('../firebase');
        const localStore = require('../utils/localStore');
        const col = getCol(BASE_COL, req);
        let records;
        if (isAvailable()) {
            const snap = await db.collection(col).where('orgId', '==', req.orgId).get();
            records = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        } else {
            records = localStore.getAll(col).filter(r => r.orgId === req.orgId);
        }
        // optional filters
        const { from, to, truckNo } = req.query;
        if (from) records = records.filter(r => (r.date || '') >= from);
        if (to)   records = records.filter(r => (r.date || '') <= to);
        if (truckNo) records = records.filter(r => r.truckNo === truckNo);
        records.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        res.json(records);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST single toll record
router.post('/', async (req, res) => {
    try {
        const { db, admin, isAvailable } = require('../firebase');
        const localStore = require('../utils/localStore');
        const col = getCol(BASE_COL, req);
        const data = { ...req.body, orgId: req.orgId, createdAt: new Date().toISOString() };
        if (isAvailable()) {
            const ref = db.collection(col).doc();
            await ref.set({ ...data, createdAt: admin.firestore.FieldValue.serverTimestamp() });
            return res.status(201).json({ id: ref.id, ...data });
        }
        const result = localStore.insert(col, data);
        res.status(201).json(result);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST bulk import (array)
router.post('/bulk', async (req, res) => {
    try {
        const { db, admin, isAvailable } = require('../firebase');
        const localStore = require('../utils/localStore');
        const col = getCol(BASE_COL, req);
        const records = req.body; // array of toll records
        if (!Array.isArray(records) || records.length === 0)
            return res.status(400).json({ error: 'Expected array of records' });

        const results = [];
        if (isAvailable()) {
            const batch = db.batch();
            records.forEach(r => {
                const ref = db.collection(col).doc();
                const data = { ...r, orgId: req.orgId, createdAt: admin.firestore.FieldValue.serverTimestamp() };
                batch.set(ref, data);
                results.push({ id: ref.id, ...r });
            });
            await batch.commit();
        } else {
            records.forEach(r => {
                const data = { ...r, orgId: req.orgId, createdAt: new Date().toISOString() };
                results.push(localStore.insert(col, data));
            });
        }
        res.status(201).json({ count: results.length, records: results });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE single toll record
router.delete('/:id', async (req, res) => {
    try {
        const { db, isAvailable } = require('../firebase');
        const localStore = require('../utils/localStore');
        const col = getCol(BASE_COL, req);
        if (isAvailable()) {
            await db.collection(col).doc(req.params.id).delete();
        } else {
            localStore.delete(col, req.params.id);
        }
        res.json({ message: 'Deleted' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
