const express = require('express');
const router = express.Router();
const { db, isAvailable } = require('../firebase');
const { getCol } = require('../utils/collectionUtils');
const localStore = require('../utils/localStore');

const EWAY_COL = 'eway_bills';
const CHALLAN_COL = 'challans';

// Helper to determine status based on validity date and loading state
function calculateEwayStatus(doc) {
    if (doc.status === 'cancelled' || doc.status === 'loaded' || doc.status === 'reissued') {
        return doc.status;
    }
    const now = new Date();
    const validUntil = new Date(doc.validUntil);
    if (!isNaN(validUntil.getTime()) && validUntil < now) {
        return 'expired_unloaded';
    }
    return doc.status || 'active';
}

// GET all E-Way Bills
router.get('/', async (req, res) => {
    try {
        let docs = [];
        if (!isAvailable()) {
            docs = localStore.getAll(EWAY_COL);
        } else {
            const snapshot = await db.collection(getCol(EWAY_COL, req)).get();
            docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        }

        // Dynamically update status for expired bills
        docs = docs.map(d => {
            const calcStatus = calculateEwayStatus(d);
            return { ...d, calculatedStatus: calcStatus };
        });

        docs.sort((a, b) => new Date(b.createdAt || b.issuedDate || 0) - new Date(a.createdAt || a.issuedDate || 0));
        res.json(docs);
    } catch (err) {
        console.error('get eway bills error:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST — Create new E-Way Bill
router.post('/', async (req, res) => {
    try {
        const { ewayBillNo, challanNo, truckNo, partyName, destination, material, quantity, consignmentValue, validUntil, brand } = req.body;
        if (!ewayBillNo || !truckNo) {
            return res.status(400).json({ error: 'ewayBillNo and truckNo are required' });
        }

        const issuedDate = req.body.issuedDate || new Date().toISOString();
        // Default validity to 24 hours if not provided
        const defaultValid = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

        const payload = {
            ewayBillNo: ewayBillNo.trim(),
            challanNo: (challanNo || '').trim(),
            truckNo: (truckNo || '').trim(),
            partyName: (partyName || '').trim(),
            destination: (destination || '').trim(),
            material: material || 'PPC',
            quantity: quantity ? parseFloat(quantity) : 0,
            consignmentValue: consignmentValue ? parseFloat(consignmentValue) : 0,
            issuedDate,
            validUntil: validUntil || defaultValid,
            status: 'active',
            brand: brand || 'all',
            createdAt: new Date().toISOString()
        };

        let created;
        if (!isAvailable()) {
            created = localStore.insert(EWAY_COL, payload);
        } else {
            const ref = await db.collection(getCol(EWAY_COL, req)).add(payload);
            created = { id: ref.id, ...payload };
        }

        res.status(201).json(created);
    } catch (err) {
        console.error('create eway bill error:', err);
        res.status(500).json({ error: err.message });
    }
});

const nicEwayService = require('../services/nicEwayService');

// POST — Live Sync E-Way Bill status directly from Govt NIC Portal
router.post('/sync-nic/:ewbNo', async (req, res) => {
    try {
        const { ewbNo } = req.params;
        const liveDetails = await nicEwayService.getLiveEwayBill(ewbNo);
        res.json({ ok: true, liveDetails });
    } catch (err) {
        console.error('NIC Live Sync Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// POST — Auto Re-issue E-Way Bill for Expired Unloaded Challan/Order (with Govt Extension option)
router.post('/:id/reissue', async (req, res) => {
    try {
        const { id } = req.params;
        const { newEwayBillNo, validUntilHours = 24, extendOnGovtPortal = false } = req.body;

        let existingDoc;
        if (!isAvailable()) {
            existingDoc = localStore.getAll(EWAY_COL).find(d => d.id === id);
        } else {
            const docSnap = await db.collection(getCol(EWAY_COL, req)).doc(id).get();
            if (docSnap.exists) existingDoc = { id: docSnap.id, ...docSnap.data() };
        }

        if (!existingDoc) {
            return res.status(404).json({ error: 'E-Way bill not found' });
        }

        let govtAck = null;
        if (extendOnGovtPortal) {
            try {
                govtAck = await nicEwayService.extendGovtEwayBillValidity(
                    existingDoc.ewayBillNo, 
                    req.body.truckNo || existingDoc.truckNo, 
                    '124106'
                );
            } catch (gErr) {
                console.warn('[Govt Portal Extension Warning]:', gErr.message);
            }
        }

        const effectiveNewNo = govtAck?.newEwayBillNo || newEwayBillNo || `EWAY-${Date.now().toString().slice(-6)}`;

        // 1. Mark existing document as reissued
        const updatedOld = {
            ...existingDoc,
            status: 'reissued',
            reissuedAt: new Date().toISOString(),
            replacedBy: effectiveNewNo,
            govtAck: govtAck || existingDoc.govtAck || null
        };

        if (!isAvailable()) {
            localStore.update(EWAY_COL, id, updatedOld);
        } else {
            await db.collection(getCol(EWAY_COL, req)).doc(id).set(updatedOld, { merge: true });
        }

        // 2. Create new active E-Way Bill linked to the same challan/order
        const now = new Date();
        const validUntil = govtAck?.validUpto || new Date(now.getTime() + (parseInt(validUntilHours) || 24) * 60 * 60 * 1000).toISOString();

        const newPayload = {
            ewayBillNo: effectiveNewNo,
            challanNo: existingDoc.challanNo,
            truckNo: req.body.truckNo || existingDoc.truckNo,
            partyName: existingDoc.partyName,
            destination: existingDoc.destination,
            material: existingDoc.material,
            quantity: existingDoc.quantity,
            consignmentValue: existingDoc.consignmentValue,
            issuedDate: now.toISOString(),
            validUntil,
            status: 'active',
            brand: existingDoc.brand || 'all',
            reissuedFrom: existingDoc.ewayBillNo,
            govtAck: govtAck || null,
            createdAt: now.toISOString()
        };

        let newDoc;
        if (!isAvailable()) {
            newDoc = localStore.insert(EWAY_COL, newPayload);
        } else {
            const ref = await db.collection(getCol(EWAY_COL, req)).add(newPayload);
            newDoc = { id: ref.id, ...newPayload };
        }

        res.json({ message: 'E-Way Bill re-issued successfully', oldBill: updatedOld, newBill: newDoc, govtAck });
    } catch (err) {
        console.error('reissue eway bill error:', err);
        res.status(500).json({ error: err.message });
    }
});

// PATCH — Update E-Way Bill status / details
router.patch('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        if (!isAvailable()) {
            localStore.update(EWAY_COL, id, req.body);
        } else {
            await db.collection(getCol(EWAY_COL, req)).doc(id).set(req.body, { merge: true });
        }
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE — Remove E-Way Bill
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        if (!isAvailable()) {
            localStore.delete(EWAY_COL, id);
        } else {
            await db.collection(getCol(EWAY_COL, req)).doc(id).delete();
        }
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
