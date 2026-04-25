const express = require('express');
const router = express.Router();
const vehicleService = require('../services/vehicleService');
const advanceService = require('../services/vehicleAdvanceService');
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

// Deduct GPS Fees Monthly
router.post('/deduct-gps', async (req, res) => {
    try {
        const vehicles = await vehicleService.getAllVehicles(getCol(BASE_COL, req));
        const gpsVehicles = vehicles.filter(v => v.gpsType && v.gpsType !== 'none');
        
        let count = 0;
        const advanceCol = getCol('vehicle_advances', req);
        const { date, remark } = req.body;
        
        for (const v of gpsVehicles) {
            const amount = v.gpsType === 'both' ? 500 : 250;
            const gpsName = v.gpsType === 'both' ? 'JK Lakshmi & JK Super' : (v.gpsType === 'jkl' ? 'JK Lakshmi' : 'JK Super');
            await advanceService.createAdvance({
                truckNo: v.truckNo,
                type: 'debit',
                amount: amount,
                date: date || new Date().toISOString().slice(0, 10),
                remark: `Monthly ${gpsName} GPS Deduction ${remark ? '- ' + remark : ''}`
            }, advanceCol);
            count++;
        }
        res.json({ message: `Successfully deducted GPS fees from ${count} vehicles.` });
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
