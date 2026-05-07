const express = require('express');
const router = express.Router();
const maintenanceService = require('../services/maintenanceService');
const { tenancyMiddleware } = require('../middleware/tenancyMiddleware');
const { requireAuth } = require('../middleware/auth');

// Apply tenancy to all routes in this router
router.use(requireAuth, tenancyMiddleware);

// Get parts catalog
router.get('/parts-catalog', (req, res) => {
    res.json(maintenanceService.PARTS_CATALOG);
});

// Get all maintenance records
router.get('/', async (req, res) => {
    try {
        const records = await maintenanceService.getAll(req.orgId);
        res.json(records);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get maintenance summary for a vehicle
router.get('/summary/:truckNo', async (req, res) => {
    try {
        const summary = await maintenanceService.getMaintenanceSummary(req.orgId, req.params.truckNo);
        res.json(summary);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get records for a specific vehicle
router.get('/vehicle/:truckNo', async (req, res) => {
    try {
        const records = await maintenanceService.getByTruckNo(req.orgId, req.params.truckNo);
        res.json(records);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get maintenance alerts (for email system)
router.get('/alerts', async (req, res) => {
    try {
        const alerts = await maintenanceService.getMaintenanceAlerts(req.orgId);
        res.json(alerts);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Create maintenance record
router.post('/', async (req, res) => {
    try {
        const result = await maintenanceService.createRecord(req.orgId, req.body);
        res.status(201).json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update maintenance record
router.patch('/:id', async (req, res) => {
    try {
        await maintenanceService.updateRecord(req.params.id, req.body);
        res.json({ message: 'Record updated' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete maintenance record
router.delete('/:id', async (req, res) => {
    try {
        await maintenanceService.deleteRecord(req.params.id);
        res.json({ message: 'Record deleted' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
