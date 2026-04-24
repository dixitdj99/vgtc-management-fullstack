const express = require('express');
const router = express.Router();
const { db, admin, isAvailable } = require('../firebase');
const localStore = require('../utils/localStore');
const { getCol } = require('../utils/collectionUtils');
const stockService = require('../utils/stockService');

const firebaseAvailable = () => isAvailable();
const BASE_COL = 'stock_transfers';

const STOCK_LOCATIONS = {
    kosli: { label: 'Kosli Stock', addCol: 'kosli_stock_additions', chalCol: 'kosli_challans', matCol: 'kosli_materials' },
    jhajjar: { label: 'Jhajjar Stock', addCol: 'jhajjar_stock_additions', chalCol: 'jhajjar_challans', matCol: 'jhajjar_materials' },
    jkl: { label: 'JK Lakshmi Stock', addCol: 'jkl_stock_additions', chalCol: 'jkl_challans', matCol: 'jkl_materials' },
};

// Create stock transfer
router.post('/', async (req, res) => {
    try {
        const { stockLocation, sourceMaterial, destMaterial, quantity, partyName, challanNo, date, remark } = req.body;

        if (!stockLocation || !STOCK_LOCATIONS[stockLocation]) throw new Error('Invalid stock location');
        if (!sourceMaterial || !destMaterial) throw new Error('Source and destination material required');
        if (sourceMaterial === destMaterial) throw new Error('Source and destination material cannot be the same');
        const qty = parseInt(quantity);
        if (!qty || qty <= 0) throw new Error('Quantity must be positive');

        const col = getCol(BASE_COL, req);
        const payload = {
            stockLocation,
            sourceMaterial,
            destMaterial,
            quantity: qty,
            partyName: partyName || '',
            challanNo: challanNo || '',
            date: date || new Date().toISOString().slice(0, 10),
            remark: remark || '',
        };

        let result;
        if (firebaseAvailable()) {
            const ref = db.collection(col).doc();
            await ref.set({ ...payload, createdAt: admin.firestore.FieldValue.serverTimestamp() });
            result = { id: ref.id, ...payload };
        } else {
            result = localStore.insert(col, payload);
        }

        // Deduct from source material, add to destination material in the same stock location
        const addColName = STOCK_LOCATIONS[stockLocation].addCol;
        const matColName = STOCK_LOCATIONS[stockLocation].matCol;

        // Add to destination material
        const addPayload = {
            material: destMaterial,
            quantity: qty,
            date: payload.date,
            remark: `Transfer from ${sourceMaterial} | Party: ${partyName || '—'} | Challan: ${challanNo || '—'}`,
            truckNo: '',
        };
        await stockService.addStock(addPayload, getCol(addColName, req), getCol(matColName, req));

        // Deduct from source material — create negative addition
        const deductPayload = {
            material: sourceMaterial,
            quantity: -qty,
            date: payload.date,
            remark: `Transfer to ${destMaterial} | Party: ${partyName || '—'} | Challan: ${challanNo || '—'}`,
            truckNo: '',
        };
        // Direct insert to bypass positive-only validation
        const addColRef = getCol(addColName, req);
        if (firebaseAvailable()) {
            const ref = db.collection(addColRef).doc();
            await ref.set({ ...deductPayload, createdAt: admin.firestore.FieldValue.serverTimestamp() });
        } else {
            localStore.insert(addColRef, deductPayload);
        }

        res.status(201).json(result);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Get all transfers
router.get('/', async (req, res) => {
    try {
        const col = getCol(BASE_COL, req);
        let transfers;
        if (firebaseAvailable()) {
            const snap = await db.collection(col).orderBy('createdAt', 'desc').get();
            transfers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        } else {
            transfers = localStore.getAll(col).sort((a, b) => new Date(b.date) - new Date(a.date));
        }
        res.json(transfers);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get stock location metadata
router.get('/locations', (req, res) => {
    res.json(Object.entries(STOCK_LOCATIONS).map(([key, val]) => ({ key, label: val.label })));
});

// Delete transfer (admin only — note: doesn't reverse the stock movements)
router.delete('/:id', async (req, res) => {
    try {
        const col = getCol(BASE_COL, req);
        if (firebaseAvailable()) {
            await db.collection(col).doc(req.params.id).delete();
        } else {
            localStore.delete(col, req.params.id);
        }
        res.json({ message: 'Transfer deleted' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
