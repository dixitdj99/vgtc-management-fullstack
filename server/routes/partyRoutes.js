const express = require('express');
const router = express.Router();
const partyService = require('../services/partyService');
const { isDummyPartyName, normalizePartyName } = require('../utils/partyNameUtils');
const { brandOfType } = require('../utils/partyBrands');
const { isProduction } = require('../utils/envConfig');

const { requireAuth } = require('../middleware/auth');
const { tenancyMiddleware } = require('../middleware/tenancyMiddleware');
router.use(requireAuth, tenancyMiddleware);

// GET /api/parties
router.get('/', async (req, res) => {
    try {
        const parties = await partyService.getAllParties(req.orgId, req);
        res.json(parties);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/parties
router.post('/', async (req, res) => {
    try {
        const party = await partyService.createParty(req.orgId, req.body, req);
        res.status(201).json(party);
    } catch (e) {
        res.status(e.code === 'SIMILAR_PARTY' || e.code === 'DUPLICATE_PARTY_CODE' ? 409 : 400)
            .json({ error: e.message, code: e.code, match: e.match });
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

        const siteByBase = {
            jkl_loading_receipts: 'jharli', kosli_loading_receipts: 'kosli',
            jhajjar_loading_receipts: 'jhajjar', bahadurgarh_loading_receipts: 'bahadurgarh'
        };
        const siteByBillType = {
            JK_Lakshmi: 'jharli', Dump: 'jharli', Kosli_Bill: 'kosli',
            Jajjhar_Bill: 'jhajjar', Bahadurgarh_Bill: 'bahadurgarh'
        };
        const profiles = new Map();
        const add = (rawName, rawCode, brand, site) => {
            const name = normalizePartyName(rawName);
            if (!name || isDummyPartyName(name)) return;
            if (!profiles.has(name)) profiles.set(name, { brands: new Set(), locations: new Set(), partyCode: '' });
            const profile = profiles.get(name);
            if (brand) profile.brands.add(brand);
            if (site) profile.locations.add(site);
            // First recorded nonblank code wins; conflicting codes require
            // a deliberate correction in Party Master.
            if (!profile.partyCode && String(rawCode || '').trim()) profile.partyCode = String(rawCode).trim().toUpperCase();
        };
        lrSnaps.forEach((snap, index) => snap.docs.forEach(doc => {
            const row = doc.data();
            const site = siteByBase[lrBases[index]];
            add(row.partyName, row.partyCode, site === 'jharli' ? 'jklakshmi' : site ? 'jksuper' : null, site);
        }));
        vSnap.docs.forEach(doc => {
            const row = doc.data();
            const brand = brandOfType(row.type);
            const site = siteByBillType[row.type];
            add(row.partyName, row.partyCode, brand, site);
            (Array.isArray(row.deliveries) ? row.deliveries : []).forEach(delivery =>
                add(delivery.partyName, delivery.partyCode, brand, site));
        });

        const existingParties = await partyService.getAllParties(orgId, req);
        const existingByName = new Map(existingParties.map(p => [normalizePartyName(p.name), p]));

        let created = 0;
        const createdNames = [];
        const conflicts = [];
        for (const [name, profile] of profiles) {
            try {
                const existing = existingByName.get(name);
                if (existing) {
                    const brands = new Set([...(existing.brands || []), ...profile.brands]);
                    const locations = new Set([...(existing.locations || []), ...profile.locations]);
                    const patch = {};
                    if (brands.size !== (existing.brands || []).length) patch.brands = [...brands];
                    if (locations.size !== (existing.locations || []).length) patch.locations = [...locations];
                    if (!String(existing.partyCode || '').trim() && profile.partyCode) patch.partyCode = profile.partyCode;
                    if (Object.keys(patch).length) await partyService.updateParty(existing.id, patch, req);
                } else {
                    await partyService.createParty(orgId, {
                        name, partyCode: profile.partyCode, type: 'customer',
                        brands: [...profile.brands], locations: [...profile.locations],
                        isActive: true, openingBalance: 0, balanceType: 'credit',
                    }, req);
                    created++;
                    createdNames.push(name);
                }
            } catch (err) {
                // Gracefully skip race-condition duplicates
                if (err.code === 'SIMILAR_PARTY' || err.code === 'DUPLICATE_PARTY_CODE') {
                    conflicts.push({ name, match: err.match?.name, reason: err.message });
                } else if (!err.message?.includes('already exists')) throw err;
            }
        }

        // Legacy production parties without a brand belong to JK Lakshmi.
        // Do not change any explicit JK Super/both-brand assignment or sandbox data.
        let taggedLegacy = 0;
        if (isProduction() && !req.user?.isSandbox) {
            for (const party of await partyService.getAllParties(orgId, req)) {
                if (!Array.isArray(party.brands) || party.brands.length === 0) {
                    await partyService.updateParty(party.id, { brands: ['jklakshmi'] }, req);
                    taggedLegacy++;
                }
            }
        }

        const skipped = profiles.size - created;
        res.json({ created, skipped, total: profiles.size, names: createdNames, conflicts, taggedLegacy });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// PATCH /api/parties/:id
router.patch('/:id', async (req, res) => {
    try {
        await partyService.updateParty(req.params.id, req.body, req);
        res.json({ message: 'Party updated successfully' });
    } catch (e) {
        res.status(e.code === 'SIMILAR_PARTY' || e.code === 'DUPLICATE_PARTY_CODE' ? 409 : 400)
            .json({ error: e.message, code: e.code, match: e.match });
    }
});

// GET /api/parties/:id/ledger — aggregate vouchers + LRs for party
router.get('/:id/ledger', async (req, res) => {
    try {
        res.json(await partyService.getPartyLedger(req.orgId, req.params.id, req));
    } catch (e) {
        res.status(e.message === 'Party not found' ? 404 : 500).json({ error: e.message });
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
        await Promise.all(ids.map(id => partyService.deleteParty(id, req)));
        res.json({ message: `${ids.length} parties deleted` });
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

// DELETE /api/parties/:id
router.delete('/:id', async (req, res) => {
    try {
        await partyService.deleteParty(req.params.id, req);
        res.json({ message: 'Party deleted successfully' });
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

module.exports = router;
