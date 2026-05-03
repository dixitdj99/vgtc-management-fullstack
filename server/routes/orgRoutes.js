const express = require('express');
const router = express.Router();
const orgService = require('../services/orgService');
const { requireSuperAdmin } = require('../middleware/auth');

// GET /api/orgs — List all orgs (superadmin only)
router.get('/', requireSuperAdmin, async (req, res) => {
    try {
        const orgs = await orgService.getAll();
        res.json(orgs);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/orgs/:id — Get single org
router.get('/:id', requireSuperAdmin, async (req, res) => {
    try {
        const org = await orgService.getById(req.params.id);
        if (!org) return res.status(404).json({ error: 'Organization not found' });
        res.json(org);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/orgs — Create org
router.post('/', requireSuperAdmin, async (req, res) => {
    try {
        const org = await orgService.createOrg({ ...req.body, createdBy: req.user.username });
        res.status(201).json(org);
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

// PATCH /api/orgs/:id — Update org
router.patch('/:id', requireSuperAdmin, async (req, res) => {
    try {
        await orgService.updateOrg(req.params.id, req.body);
        res.json({ message: 'Organization updated' });
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

// POST /api/orgs/:id/deactivate — Deactivate org
router.post('/:id/deactivate', requireSuperAdmin, async (req, res) => {
    try {
        await orgService.deactivateOrg(req.params.id);
        res.json({ message: 'Organization deactivated' });
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

// POST /api/orgs/:id/payment — Record a UPI payment
router.post('/:id/payment', requireSuperAdmin, async (req, res) => {
    try {
        const payment = await orgService.recordPayment(req.params.id, req.body);
        res.status(201).json(payment);
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

// POST /api/orgs/:id/payment/:paymentId/verify — Verify payment & upgrade plan
router.post('/:id/payment/:paymentId/verify', requireSuperAdmin, async (req, res) => {
    try {
        await orgService.verifyPayment(req.params.id, req.params.paymentId, req.body.plan);
        res.json({ message: 'Payment verified and plan updated' });
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

// GET /api/orgs/plans/list — Public: list available plans
router.get('/plans/list', async (req, res) => {
    res.json(orgService.PLANS);
});

// GET /api/orgs/my/info — Get current user's org info (any authenticated user)
router.get('/my/info', require('../middleware/auth').requireAuth, async (req, res) => {
    try {
        if (!req.user.orgId) return res.status(400).json({ error: 'No organization assigned' });
        const org = await orgService.getById(req.user.orgId);
        if (!org) return res.status(404).json({ error: 'Organization not found' });
        // Return safe subset (no payment details for non-superadmin)
        const { payments, ...safeOrg } = org;
        res.json(safeOrg);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
