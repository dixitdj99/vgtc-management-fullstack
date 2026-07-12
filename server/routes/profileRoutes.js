const express = require('express');
const router = express.Router();
const { db, isAvailable } = require('../firebase');
const { getCol } = require('../utils/collectionUtils');
const localStore = require('../utils/localStore');

// Collection Name
const PROFILE_COL = 'profiles';

// GET all profiles
router.get('/', async (req, res) => {
    try {
        let docs = [];
        if (!isAvailable()) {
            docs = localStore.getAll(PROFILE_COL);
            docs = docs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        } else {
            const snapshot = await db.collection(getCol(PROFILE_COL, req))
                .get();
            docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            docs.sort((a, b) => {
                const aT = a.createdAt?.seconds || new Date(a.createdAt || 0).getTime() / 1000;
                const bT = b.createdAt?.seconds || new Date(b.createdAt || 0).getTime() / 1000;
                return bT - aT;
            });
        }
        res.json(docs);
    } catch (err) {
        console.error('get profiles error:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST a new profile
router.post('/', async (req, res) => {
    try {
        const payload = {
            ...req.body,
            createdAt: new Date().toISOString()
        };

        let docRefId;
        if (!isAvailable()) {
            const doc = localStore.insert(PROFILE_COL, payload);
            docRefId = doc.id;
        } else {
            const docRef = await db.collection(getCol(PROFILE_COL, req)).add(payload);
            docRefId = docRef.id;
        }
        
        res.json({ id: docRefId, ...payload });
    } catch (err) {
        console.error('add profile error:', err);
        res.status(500).json({ error: err.message });
    }
});

// PUT update a profile
router.put('/:id', async (req, res) => {
    try {
        const payload = { ...req.body, updatedAt: new Date().toISOString() };
        
        if (!isAvailable()) {
            localStore.update(PROFILE_COL, req.params.id, payload);
        } else {
            await db.collection(getCol(PROFILE_COL, req)).doc(req.params.id).update(payload);
        }
        res.json({ id: req.params.id, ...payload });
    } catch (err) {
        console.error('update profile error:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET driver trip history — GET /profiles/:id/trips
router.get('/:id/trips', async (req, res) => {
    try {
        if (!isAvailable()) return res.json({ trips: [], stats: {} });
        const profileDoc = await db.collection(getCol(PROFILE_COL, req)).doc(req.params.id).get();
        if (!profileDoc.exists) return res.status(404).json({ error: 'Profile not found' });
        const profile = profileDoc.data();
        const driverName = (profile.name || '').toLowerCase().trim();
        if (!driverName) return res.json({ trips: [], stats: {} });

        const vCol = getCol('vouchers', req);
        const snapshot = await db.collection(vCol).get();
        const trips = snapshot.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter(v => (v.driverName || '').toLowerCase().trim() === driverName)
            .sort((a, b) => (b.date||'').localeCompare(a.date||''));

        const calcNet = (v) => {
            const g = (parseFloat(v.weight)||0) * (parseFloat(v.rate)||0);
            const d = v.advanceDiesel === 'FULL' ? 4000 : (parseFloat(v.advanceDiesel)||0);
            return g - d - (parseFloat(v.advanceCash)||0) - (parseFloat(v.advanceOnline)||0) - (parseFloat(v.munshi)||0) - (parseFloat(v.shortage)||0) - (parseFloat(v.commission)||0);
        };
        const totalNet = trips.reduce((s, v) => s + calcNet(v), 0);
        const totalWeight = trips.reduce((s, v) => s + (parseFloat(v.weight)||0), 0);
        const stats = { tripCount: trips.length, totalNet, totalWeight: totalWeight.toFixed(2), avgNet: trips.length > 0 ? totalNet / trips.length : 0, lastTrip: trips[0]?.date || null };
        res.json({ trips: trips.map(v => ({ id: v.id, date: v.date, lrNo: v.lrNo, truckNo: v.truckNo, destination: v.destination, weight: v.weight, net: calcNet(v) })), stats });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE a profile
router.delete('/:id', async (req, res) => {
    try {
        if (!isAvailable()) {
            localStore.delete(PROFILE_COL, req.params.id);
        } else {
            await db.collection(getCol(PROFILE_COL, req)).doc(req.params.id).delete();
        }
        res.json({ message: 'Profile deleted' });
    } catch (err) {
        console.error('delete profile error:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
