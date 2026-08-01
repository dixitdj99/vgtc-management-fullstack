/**
 * ewayRoutes.js — the e-way bill feed behind Stock → Challans.
 *
 * The feed is one list per GSTIN, not per plant, so the raw bill is stored once
 * and each plant asks for it with its own material names. That is why /pending
 * takes `materials`: "PPC" has to resolve against the JK Lakshmi list on one tab
 * and the JK Super list on another, from the same stored bill.
 *
 * Nothing here 500s when the API is unconfigured. Most of the time it will be —
 * credentials take weeks to arrive — and a yard that has never had the feed
 * should see "not connected", not a red error on a screen it uses all day.
 */

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { tenancyMiddleware } = require('../middleware/tenancyMiddleware');
const { getEnvCol } = require('../utils/collectionUtils');
const ewbService = require('../utils/ewbService');
const ewbStore = require('../utils/ewbStore');
const ewbSync = require('../utils/ewbSync');

router.use(requireAuth, tenancyMiddleware);

// The feed is per-GSTIN, so it is not split by plant the way stock is.
const BILLS_COL = () => getEnvCol('eway_bills');
const STATE_COL = () => getEnvCol(ewbStore.STATE_COL);

const parseMaterials = (q) =>
    String(q || '').split(',').map(s => s.trim()).filter(Boolean);

/** Whether the feed can run at all, and when it last did. */
router.get('/status', async (req, res) => {
    try {
        const configured = ewbService.isConfigured();
        const state = configured ? await ewbStore.readState(req.orgId, STATE_COL()) : null;
        res.json({
            configured,
            missing: configured ? [] : ewbService.missingConfig(),
            lastSyncAt: state?.lastSyncAt || null,
            lastError: state?.lastError || null,
            lastCounts: state?.lastCounts || null,
        });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

/**
 * Bills waiting to become challans, each already shaped like the form.
 * @query materials comma-separated material names for the calling plant
 */
router.get('/pending', async (req, res) => {
    try {
        if (!ewbService.isConfigured()) {
            return res.json({ configured: false, missing: ewbService.missingConfig(), bills: [] });
        }
        const materials = parseMaterials(req.query.materials);
        const stored = await ewbStore.listBills(req.orgId, BILLS_COL(), 'pending');
        const bills = stored.map(b => ({
            ewbNo: b.ewbNo,
            ewbDate: b.ewbDate || '',
            validUpto: b.validUpto || '',
            draft: ewbService.toChallanDraft(b.detail || {}, { materials }),
        }));
        res.json({ configured: true, bills });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

/** Manual refresh, for when a load is on the gate and nobody wants to wait. */
router.post('/sync', async (req, res) => {
    try {
        const result = await ewbSync.syncOrg(req.orgId, {
            billsCol: BILLS_COL(),
            stateCol: STATE_COL(),
        });
        res.json(result);
    } catch (e) { res.status(502).json({ error: e.message }); }
});

/**
 * Records what the operator did with a bill.
 * @body {'used'|'ignored'|'pending'} status, and challanId when used
 */
router.post('/:ewbNo/status', async (req, res) => {
    try {
        const { status, challanId } = req.body || {};
        if (!['used', 'ignored', 'pending'].includes(status)) {
            return res.status(400).json({ error: 'status must be used, ignored or pending' });
        }
        const doc = await ewbStore.setStatus(req.orgId, req.params.ewbNo, status, BILLS_COL(), challanId || null);
        res.json(doc);
    } catch (e) { res.status(400).json({ error: e.message }); }
});

module.exports = router;
