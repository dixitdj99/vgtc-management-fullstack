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
                .orderBy('createdAt', 'desc')
                .get();
            docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
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
