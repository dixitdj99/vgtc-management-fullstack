const express = require('express');
const router = express.Router();
const { db, isAvailable } = require('../firebase');
const { getCol } = require('../utils/collectionUtils');
const { isProduction } = require('../utils/envConfig');
const localStore = require('../utils/localStore');

const isDummyProfileName = (name) => {
    if (!name) return false;
    const n = String(name).trim().toUpperCase();
    if (/\b(TEST|DUMMY|SAMPLE|MOCK)\b/i.test(n)) return true;
    if (n === 'PREM' || n === 'PAREM' || n === 'EKBAL KHAN' || n === 'IQBAL KHAN') return true;
    return false;
};

// Collection Name
const PROFILE_COL = 'profiles';

// The roll-call photo is stored inline on the profile document. A Firestore
// document is capped at 1 MB in total, so reject anything that would crowd out
// the rest of the record. The client already downscales to ~10-20 KB; this is
// the backstop for a client that does not.
const PHOTO_MAX_BYTES = 200 * 1024;

const validatePhoto = (photo) => {
    if (photo === undefined || photo === null || photo === '') return null;
    if (typeof photo !== 'string') return 'photo must be a data URI string';
    if (!/^data:image\/(jpeg|png|webp);base64,/.test(photo)) {
        return 'photo must be a base64 JPEG, PNG or WebP data URI';
    }
    if (Buffer.byteLength(photo, 'utf8') > PHOTO_MAX_BYTES) {
        return `photo is too large (max ${Math.round(PHOTO_MAX_BYTES / 1024)} KB after encoding)`;
    }
    return null;
};

// Fields that callers are permitted to write. Anything else in req.body is
// silently dropped so that a client cannot set arbitrary internal fields.
const ALLOWED_FIELDS = [
    'name', 'phone', 'role', 'profileType', 'vehicleNo', 'salary',
    'joiningDate', 'address', 'photo', 'photos', 'faceEmbedding',
    'fingerprintEnrolled', 'fingerprintSlotId', 'paidLeaveEntitlement',
    'department', 'type'
];

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
        const photoError = validatePhoto(req.body.photo);
        if (photoError) return res.status(400).json({ error: photoError });

        if (isProduction() && isDummyProfileName(req.body.name)) {
            return res.status(400).json({ error: `Cannot create test profile "${req.body.name}" in production` });
        }

        const targetId = req.body.id ? String(req.body.id).trim() : null;

        // Fix #2: allowlist — never spread the whole req.body into Firestore
        const payload = {};
        ALLOWED_FIELDS.forEach(k => { if (req.body[k] !== undefined) payload[k] = req.body[k]; });
        payload.createdAt = req.body.createdAt || new Date().toISOString();
        if (req.body.id) payload.id = req.body.id; // preserve only the id field explicitly

        let docRefId = targetId;
        if (!isAvailable()) {
            if (targetId) {
                const existing = localStore.getById(PROFILE_COL, targetId);
                if (existing) {
                    localStore.update(PROFILE_COL, targetId, payload);
                } else {
                    const docs = localStore.getAll(PROFILE_COL);
                    docs.unshift({ id: targetId, ...payload });
                    const fs = require('fs');
                    const path = require('path');
                    const DATA_DIR = path.join(__dirname, '..', 'data');
                    const file = path.join(DATA_DIR, PROFILE_COL + '.json');
                    try { fs.writeFileSync(file, JSON.stringify(docs, null, 2), 'utf8'); } catch (_) {}
                }
            } else {
                const doc = localStore.insert(PROFILE_COL, payload);
                docRefId = doc.id;
            }
        } else {
            const colRef = db.collection(getCol(PROFILE_COL, req));
            if (targetId) {
                await colRef.doc(targetId).set(payload, { merge: true });
            } else {
                const docRef = await colRef.add(payload);
                docRefId = docRef.id;
            }
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
        const photoError = validatePhoto(req.body.photo);
        if (photoError) return res.status(400).json({ error: photoError });

        if (isProduction() && req.body.name && isDummyProfileName(req.body.name)) {
            return res.status(400).json({ error: `Cannot set test profile name "${req.body.name}" in production` });
        }

        const targetId = String(req.params.id).trim();

        // Fix #3: allowlist — never spread the whole req.body into Firestore
        const payload = {};
        ALLOWED_FIELDS.forEach(k => { if (req.body[k] !== undefined) payload[k] = req.body[k]; });
        payload.id = targetId;
        payload.updatedAt = new Date().toISOString();
        
        if (!isAvailable()) {
            const existing = localStore.getById(PROFILE_COL, targetId);
            if (existing) {
                localStore.update(PROFILE_COL, targetId, payload);
            } else {
                const docs = localStore.getAll(PROFILE_COL);
                const idx = docs.findIndex(d => d.id === targetId || d.name === payload.name);
                if (idx >= 0) {
                    docs[idx] = { ...docs[idx], ...payload, updatedAt: new Date().toISOString() };
                } else {
                    docs.unshift(payload);
                }
                const fs = require('fs');
                const path = require('path');
                const DATA_DIR = path.join(__dirname, '..', 'data');
                const file = path.join(DATA_DIR, PROFILE_COL + '.json');
                try { fs.writeFileSync(file, JSON.stringify(docs, null, 2), 'utf8'); } catch (_) {}
            }
        } else {
            const colRef = db.collection(getCol(PROFILE_COL, req));
            // Fix #1: only update the target document — no "sync by name" cross-doc writes
            await colRef.doc(targetId).set(payload, { merge: true });
        }
        res.json({ id: targetId, ...payload });
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
