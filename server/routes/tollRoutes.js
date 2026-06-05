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

// POST bulk import (array) — chunked to stay within Firestore 500-op batch limit
router.post('/bulk', async (req, res) => {
    try {
        const { db, admin, isAvailable } = require('../firebase');
        const localStore = require('../utils/localStore');
        const col = getCol(BASE_COL, req);
        const records = req.body;
        if (!Array.isArray(records) || records.length === 0)
            return res.status(400).json({ error: 'Expected array of records' });

        let totalCount = 0;

        if (isAvailable()) {
            const CHUNK = 400; // well under Firestore 500-op batch limit
            for (let i = 0; i < records.length; i += CHUNK) {
                const chunk = records.slice(i, i + CHUNK);
                const batch = db.batch();
                chunk.forEach(r => {
                    const ref = db.collection(col).doc();
                    const data = { ...r, orgId: req.orgId, createdAt: admin.firestore.FieldValue.serverTimestamp() };
                    batch.set(ref, data);
                });
                await batch.commit();
                totalCount += chunk.length;
                console.log(`[Tolls] Imported chunk ${i / CHUNK + 1}: ${chunk.length} records`);
            }
        } else {
            records.forEach(r => {
                localStore.insert(col, { ...r, orgId: req.orgId, createdAt: new Date().toISOString() });
                totalCount++;
            });
        }

        res.status(201).json({ count: totalCount, message: `${totalCount} toll records imported successfully` });
    } catch (e) {
        console.error('[Tolls] Bulk import error:', e);
        res.status(500).json({ error: e.message });
    }
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
