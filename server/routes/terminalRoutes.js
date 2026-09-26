/**
 * terminalRoutes.js — API endpoints for VGTC OS Terminal
 */

const express = require('express');
const router = express.Router();
const attendanceDecisionEngine = require('../services/attendanceDecisionEngine');
const localStore = require('../utils/localStore');
const { db, isAvailable } = require('../firebase');

// Active terminals in-memory / storage registry
let terminalRegistry = {
    'OFFICE-REWARI-01': {
        terminalId: 'OFFICE-REWARI-01',
        name: 'Main Yard Terminal — Gate 1',
        location: 'Jharli / Rewari',
        status: 'ONLINE',
        lastSeen: new Date().toISOString(),
        battery: 94,
        storage: 82,
        camera: 'OK',
        faceEngine: 'OK',
        version: '1.0.0'
    }
};

/**
 * GET /api/terminal/roster
 * Downloads active fleet & staff roster for on-device matching
 */
router.get('/roster', async (req, res) => {
    try {
        const roster = await attendanceDecisionEngine.getTerminalRoster();
        res.json({ success: true, ...roster });
    } catch (err) {
        console.error('[TerminalRoutes] Failed to fetch roster:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * POST /api/terminal/event
 * Processes a single scan / decision event
 */
router.post('/event', async (req, res) => {
    try {
        const result = await attendanceDecisionEngine.processEvent(req.body);
        res.json(result);
    } catch (err) {
        console.error('[TerminalRoutes] Failed to process event:', err);
        res.status(500).json({ status: 'ERROR', message: err.message });
    }
});

/**
 * POST /api/terminal/sync
 * Batch uploads offline queued events
 */
router.post('/sync', async (req, res) => {
    try {
        const { events = [] } = req.body;
        const results = [];

        for (const evt of events) {
            try {
                const resItem = await attendanceDecisionEngine.processEvent(evt);
                results.push({ eventId: evt.eventId, status: resItem.status, message: resItem.message });
            } catch (itemErr) {
                results.push({ eventId: evt.eventId, status: 'FAILED', message: itemErr.message });
            }
        }

        res.json({
            success: true,
            syncedCount: results.filter(r => r.status === 'SUCCESS').length,
            results
        });
    } catch (err) {
        console.error('[TerminalRoutes] Sync failed:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * POST /api/terminal/enroll
 * Enrolls or updates face/fingerprint biometric data and assigned vehicle
 */
router.post('/enroll', async (req, res) => {
    try {
        const result = await attendanceDecisionEngine.enrollPerson(req.body);
        res.json({ success: true, person: result });
    } catch (err) {
        console.error('[TerminalRoutes] Enroll failed:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * POST /api/terminal/enroll/delete
 * Deletes / clears biometric enrollment for a person
 */
router.post('/enroll/delete', async (req, res) => {
    try {
        const { id } = req.body;
        const result = await attendanceDecisionEngine.deleteEnrollment(id);
        res.json(result);
    } catch (err) {
        console.error('[TerminalRoutes] Delete enrollment failed:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * POST /api/terminal/assign-vehicle
 * Assigns a driver to a specific VGTC vehicle
 */
router.post('/assign-vehicle', async (req, res) => {
    try {
        const { driverId, vehicleNo } = req.body;
        const result = await attendanceDecisionEngine.assignVehicle(driverId, vehicleNo);
        res.json(result);
    } catch (err) {
        console.error('[TerminalRoutes] Assign vehicle failed:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * POST /api/terminal/heartbeat
 * Periodic telemetry from terminal (battery, camera status, sync status)
 */
router.post('/heartbeat', (req, res) => {
    const { terminalId = 'OFFICE-REWARI-01', battery = 100, storage = 80, camera = 'OK', faceEngine = 'OK', version = '1.0.0' } = req.body;
    terminalRegistry[terminalId] = {
        terminalId,
        name: terminalRegistry[terminalId]?.name || `Terminal ${terminalId}`,
        location: terminalRegistry[terminalId]?.location || 'Main Gate',
        status: 'ONLINE',
        lastSeen: new Date().toISOString(),
        battery,
        storage,
        camera,
        faceEngine,
        version
    };
    res.json({ success: true, timestamp: new Date().toISOString() });
});

/**
 * GET /api/terminal/status
 * Fetches status of all registered terminals
 */
router.get('/status', (req, res) => {
    res.json({
        success: true,
        terminals: Object.values(terminalRegistry)
    });
});

module.exports = router;
