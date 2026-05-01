const express = require('express');
const router = express.Router();
const vehicleService = require('../services/vehicleService');
const { getCol } = require('../utils/collectionUtils');
const BASE_COL = 'vehicles';

// Create
router.post('/', async (req, res) => {
    try {
        const result = await vehicleService.createVehicle(req.body, getCol(BASE_COL, req));
        res.status(201).json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get all
router.get('/', async (req, res) => {
    try {
        const vehicles = await vehicleService.getAllVehicles(getCol(BASE_COL, req));
        res.json(vehicles);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update
router.patch('/:id', async (req, res) => {
    try {
        await vehicleService.updateVehicle(req.params.id, req.body, getCol(BASE_COL, req));
        res.json({ message: 'Vehicle updated' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete
router.delete('/:id', async (req, res) => {
    try {
        await vehicleService.deleteVehicle(req.params.id, getCol(BASE_COL, req));
        res.json({ message: 'Vehicle deleted' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
