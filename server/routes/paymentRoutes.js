const express = require('express');
const router = express.Router();
const { db, isAvailable } = require('../firebase');
const { getCol } = require('../utils/collectionUtils');
const localStore = require('../utils/localStore');

const PAYMENTS_COL = 'profile_payments';

// GET all payments
router.get('/', async (req, res) => {
    try {
        let docs = [];
        if (!isAvailable()) {
            docs = localStore.getAll(PAYMENTS_COL);
            docs = docs.sort((a, b) => new Date(b.date) - new Date(a.date));
        } else {
            const snapshot = await db.collection(getCol(PAYMENTS_COL, req))
                .orderBy('date', 'desc')
                .get();
            docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        }
        res.json(docs);
    } catch (err) {
        console.error('get payments error:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST a new payment
router.post('/', async (req, res) => {
    try {
        const payload = {
            ...req.body,
            createdAt: new Date().toISOString()
        };

        let docRefId;
        if (!isAvailable()) {
            const doc = localStore.insert(PAYMENTS_COL, payload);
            docRefId = doc.id;
        } else {
            const docRef = await db.collection(getCol(PAYMENTS_COL, req)).add(payload);
            docRefId = docRef.id;
        }
        
        res.json({ id: docRefId, ...payload });
    } catch (err) {
        console.error('add payment error:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
