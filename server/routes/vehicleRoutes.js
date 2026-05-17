const express = require('express');
const router = express.Router();
const vehicleService = require('../services/vehicleService');
const advanceService = require('../services/vehicleAdvanceService');
const alertService = require('../services/alertService');
const { getCol } = require('../utils/collectionUtils');
const { tenancyMiddleware } = require('../middleware/tenancyMiddleware');
const { requireAuth } = require('../middleware/auth');

// Apply tenancy to all routes in this router
router.use(requireAuth, tenancyMiddleware);
const BASE_COL = 'vehicles';

// Create
router.post('/', async (req, res) => {
    try {
        const result = await vehicleService.createVehicle(req.orgId, req.body, getCol(BASE_COL, req));
        res.status(201).json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get all
router.get('/', async (req, res) => {
    try {
        const vehicles = await vehicleService.getAllVehicles(req.orgId, getCol(BASE_COL, req));
        res.json(vehicles);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Deduct GPS Fees Monthly
router.post('/deduct-gps', async (req, res) => {
    try {
        const vehicles = await vehicleService.getAllVehicles(req.orgId, getCol(BASE_COL, req));
        const gpsVehicles = vehicles.filter(v => v.gpsType && v.gpsType !== 'none');
        
        let count = 0;
        const advanceCol = getCol('vehicle_advances', req);
        const { date, remark } = req.body;
        
        for (const v of gpsVehicles) {
            const amount = v.gpsType === 'both' ? 500 : 250;
            const gpsName = v.gpsType === 'both' ? 'JK Lakshmi & JK Super' : (v.gpsType === 'jkl' ? 'JK Lakshmi' : 'JK Super');
            await advanceService.createAdvance(req.orgId, {
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

// Trigger fleet-wide alert report
router.get('/alerts/report', async (req, res) => {
    try {
        const result = await alertService.sendDailyAlertReport(req.orgId, getCol(BASE_COL, req));
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Trigger alert for a single vehicle
router.get('/alerts/vehicle/:id', async (req, res) => {
    try {
        const result = await alertService.sendVehicleAlert(req.orgId, req.params.id, getCol(BASE_COL, req));
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete full owner with all their vehicles
router.delete('/owners', async (req, res) => {
    try {
        const result = await vehicleService.deleteOwnerWithVehicles(req.orgId, req.body, getCol(BASE_COL, req));
        res.json({
            message: `Deleted ${result.vehiclesDeleted} vehicles for owner`,
            ...result
        });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Update
router.patch('/:id', async (req, res) => {
    try {
        await vehicleService.updateVehicle(req.orgId, req.params.id, req.body, getCol(BASE_COL, req));
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

// ── Vehicle Firm Registry ─────────────────────────────────────────────────────
const REG_COL = 'vehicle_registry';

router.get('/registry', async (req, res) => {
    try {
        const { db, admin, isAvailable } = require('../firebase');
        const localStore = require('../utils/localStore');
        if (isAvailable()) {
            const snap = await db.collection(getCol(REG_COL, req)).where('orgId', '==', req.orgId).get();
            const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            return res.json(docs);
        }
        return res.json(localStore.getAll(getCol(REG_COL, req)).filter(x => x.orgId === req.orgId));
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/registry', async (req, res) => {
    try {
        const { db, admin, isAvailable } = require('../firebase');
        const localStore = require('../utils/localStore');
        const payload = { ...req.body, orgId: req.orgId, createdAt: new Date().toISOString() };
        if (isAvailable()) {
            const ref = db.collection(getCol(REG_COL, req)).doc();
            await ref.set({ ...payload, createdAt: admin.firestore.FieldValue.serverTimestamp() });
            return res.status(201).json({ id: ref.id, ...payload });
        }
        return res.status(201).json(localStore.insert(getCol(REG_COL, req), payload));
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/registry/:id', async (req, res) => {
    try {
        const { db, admin, isAvailable } = require('../firebase');
        const localStore = require('../utils/localStore');
        if (isAvailable()) {
            await db.collection(getCol(REG_COL, req)).doc(req.params.id).update({ ...req.body, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
        } else {
            localStore.update(getCol(REG_COL, req), req.params.id, req.body);
        }
        res.json({ message: 'Updated' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/registry/:id', async (req, res) => {
    try {
        const { db, isAvailable } = require('../firebase');
        const localStore = require('../utils/localStore');
        if (isAvailable()) {
            await db.collection(getCol(REG_COL, req)).doc(req.params.id).delete();
        } else {
            localStore.delete(getCol(REG_COL, req), req.params.id);
        }
        res.json({ message: 'Deleted' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
