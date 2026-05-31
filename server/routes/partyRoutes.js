const express = require('express');
const router = express.Router();
const partyService = require('../services/partyService');

// Require authentication middleware (assuming it exists and is used globally or here)
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
