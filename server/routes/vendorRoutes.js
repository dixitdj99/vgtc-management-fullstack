const express = require('express');
const router = express.Router();
const vendorService = require('../services/vendorService');
const { requireAuth } = require('../middleware/auth');
const { tenancyMiddleware } = require('../middleware/tenancyMiddleware');

router.use(requireAuth, tenancyMiddleware);

// GET /api/vendors
router.get('/', async (req, res) => {
    try {
        const vendors = await vendorService.getAllVendors(req.orgId);
        res.json(vendors);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/vendors
router.post('/', async (req, res) => {
    try {
        const vendor = await vendorService.createVendor(req.orgId, req.body);
        res.status(201).json(vendor);
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

// PATCH /api/vendors/:id
router.patch('/:id', async (req, res) => {
    try {
        await vendorService.updateVendor(req.params.id, req.body);
        res.json({ message: 'Vendor updated successfully' });
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

// DELETE /api/vendors/:id
router.delete('/:id', async (req, res) => {
    try {
        await vendorService.deleteVendor(req.params.id);
        res.json({ message: 'Vendor deleted successfully' });
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

module.exports = router;
