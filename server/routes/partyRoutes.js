const express = require('express');
const router = express.Router();
const partyService = require('../services/partyService');

const { requireAuth } = require('../middleware/auth');
const { tenancyMiddleware } = require('../middleware/tenancyMiddleware');
router.use(requireAuth, tenancyMiddleware);

// GET /api/parties
router.get('/', async (req, res) => {
    try {
        const parties = await partyService.getAllParties(req.orgId);
        res.json(parties);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/parties
router.post('/', async (req, res) => {
    try {
        const party = await partyService.createParty(req.orgId, req.body);
        res.status(201).json(party);
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

// POST /api/parties/sync — scan vouchers + ALL LR collections for unique
// partyName values and create a party record for each name not yet in the master.
router.post('/sync', async (req, res) => {
    try {
        const { db, isAvailable } = require('../firebase');
        const { getCol } = require('../utils/collectionUtils');

        if (!isAvailable()) return res.status(503).json({ error: 'Database not available' });

        const orgId = req.orgId;

        // All LR collection base names — one per plant / brand
        const lrBases = [
            'loading_receipts',
            'kosli_loading_receipts',
            'jhajjar_loading_receipts',
            'bahadurgarh_loading_receipts',
            'jkl_loading_receipts',
        ];

        const voucherCol = getCol('vouchers', req);
        const lrCols = lrBases.map(b => getCol(b, req));

        // Fetch all collections in parallel
        const [vSnap, ...lrSnaps] = await Promise.all([
            db.collection(voucherCol).where('orgId', '==', orgId).get(),
            ...lrCols.map(col => db.collection(col).where('orgId', '==', orgId).get()),
        ]);

        // Collect unique normalised (UPPERCASE) party names
        const uniqueNames = new Set();
        const addName = (raw) => {
            const n = (raw || '').trim().toUpperCase();
            if (n) uniqueNames.add(n);
        };
        vSnap.docs.forEach(d => addName(d.data().partyName));
        lrSnaps.forEach(snap => snap.docs.forEach(d => addName(d.data().partyName)));

        // Skip names that already have a party record
        const existingParties = await partyService.getAllParties(orgId);
        const existingNames = new Set(existingParties.map(p => (p.name || '').toUpperCase().trim()));

        const toCreate = [...uniqueNames].filter(n => !existingNames.has(n));

        let created = 0;
        const createdNames = [];
        for (const name of toCreate) {
            try {
                await partyService.createParty(orgId, {
                    name,
                    type: 'customer',
                    brands: [],         // untagged — visible in every module
                    isActive: true,
                    openingBalance: 0,
                    balanceType: 'credit',
                });
                created++;
                createdNames.push(name);
            } catch (err) {
                // Gracefully skip race-condition duplicates
                if (!err.message?.includes('already exists')) throw err;
            }
        }

        const skipped = uniqueNames.size - created;
        res.json({ created, skipped, total: uniqueNames.size, names: createdNames });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// PATCH /api/parties/:id
router.patch('/:id', async (req, res) => {
    try {
        await partyService.updateParty(req.params.id, req.body);
        res.json({ message: 'Party updated successfully' });
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

// GET /api/parties/:id/ledger — aggregate vouchers + LRs for party
router.get('/:id/ledger', async (req, res) => {
    try {
        const { db, isAvailable } = require('../firebase');
        const { getCol } = require('../utils/collectionUtils');
        if (!isAvailable()) return res.json({ vouchers: [], lrs: [], summary: {} });

        const partyDoc = await db.collection('parties').doc(req.params.id).get();
        const partyName = (partyDoc.exists ? (partyDoc.data().name || '') : '').toUpperCase().trim();
        if (!partyName) return res.json({ vouchers: [], lrs: [], summary: {} });

        const orgId = req.orgId;
        const vCol = getCol('vouchers', req);
        const lrCol = getCol('loading_receipts', req);

        const [vSnap, lrSnap] = await Promise.all([
            db.collection(vCol).where('orgId', '==', orgId).get(),
            db.collection(lrCol).where('orgId', '==', orgId).get(),
        ]);

        const vouchers = vSnap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter(v => (v.partyName || '').toUpperCase().trim() === partyName)
            .sort((a, b) => (b.date || '') > (a.date || '') ? 1 : -1);

        const lrs = lrSnap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter(l => (l.partyName || '').toUpperCase().trim() === partyName)
            .sort((a, b) => (b.date || '') > (a.date || '') ? 1 : -1);

        // Summary stats
        const calcNet = (v) => {
            const g = (parseFloat(v.weight)||0) * (parseFloat(v.rate)||0);
            const d = v.advanceDiesel === 'FULL' ? 4000 : (parseFloat(v.advanceDiesel)||0);
            return g - d - (parseFloat(v.advanceCash)||0) - (parseFloat(v.advanceOnline)||0) - (parseFloat(v.munshi)||0) - (parseFloat(v.shortage)||0) - (parseFloat(v.commission)||0);
        };
        const totalNet = vouchers.reduce((s, v) => s + calcNet(v), 0);
        const totalPaid = vouchers.reduce((s, v) => s + (parseFloat(v.paidBalance)||0), 0);
        const outstanding = Math.max(0, totalNet - totalPaid);

        res.json({ vouchers, lrs, summary: { trips: vouchers.length, lrCount: lrs.length, totalNet, totalPaid, outstanding, lastActivity: vouchers[0]?.date || lrs[0]?.date || null } });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// DELETE /api/parties/bulk — delete multiple parties at once (body: { ids: [...] })
// NOTE: must be declared before /:id so Express doesn't treat 'bulk' as an id param.
router.delete('/bulk', async (req, res) => {
    try {
        const { ids } = req.body;
        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: 'ids array is required' });
        }
        await Promise.all(ids.map(id => partyService.deleteParty(id)));
        res.json({ message: `${ids.length} parties deleted` });
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

// DELETE /api/parties/:id
router.delete('/:id', async (req, res) => {
    try {
        await partyService.deleteParty(req.params.id);
        res.json({ message: 'Party deleted successfully' });
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

module.exports = router;
