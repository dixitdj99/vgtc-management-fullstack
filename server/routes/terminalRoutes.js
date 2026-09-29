/**
 * terminalRoutes.js — API endpoints for VGTC OS Terminal
 */

const express = require('express');
const router = express.Router();
const attendanceDecisionEngine = require('../services/attendanceDecisionEngine');
const localStore = require('../utils/localStore');
const { admin, db, isAvailable } = require('../firebase');
const fs = require('fs');
const path = require('path');
const { publishAttendanceChange } = require('../services/attendanceRealtime');

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
        if (result.status === 'SUCCESS') {
            publishAttendanceChange({
                source: 'terminal',
                action: result.eventType,
                date: result.date,
                profileId: result.person?.id,
                punchId: result.punchId,
            });
        }
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
                if (resItem.status === 'SUCCESS') {
                    publishAttendanceChange({
                        source: 'terminal_sync',
                        action: resItem.eventType,
                        date: resItem.date,
                        profileId: resItem.person?.id,
                        punchId: resItem.punchId,
                    });
                }
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

// Store enrollment photos as real web URLs for the portal. Firebase Storage is
// preferred in production; the local public folder keeps beta/offline installs
// usable without turning a phone file:// URI into a broken portal image.
router.post('/enroll-images', async (req, res) => {
    try {
        const profileId = String(req.body.profileId || '').replace(/[^a-zA-Z0-9_-]/g, '');
        const photos = Array.isArray(req.body.photos) ? req.body.photos : [];
        if (!profileId || !photos.length) return res.status(400).json({ error: 'profileId and photos are required' });
        const urls = [];
        for (let i = 0; i < photos.length; i++) {
            const match = String(photos[i]).match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
            if (!match) continue;
            const mime = match[1];
            const ext = mime.split('/')[1].replace('jpeg', 'jpg');
            const filename = `enroll-${profileId}-${i + 1}-${Date.now()}.${ext}`;
            const buffer = Buffer.from(match[2], 'base64');
            if (isAvailable() && admin?.storage) {
                const bucket = admin.storage().bucket();
                const file = bucket.file(`enrollment/${filename}`);
                await file.save(buffer, { metadata: { contentType: mime, cacheControl: 'public,max-age=31536000' } });
                await file.makePublic();
                urls.push(`https://storage.googleapis.com/${bucket.name}/${encodeURIComponent(`enrollment/${filename}`)}`);
            } else {
                const dir = path.join(__dirname, '..', '..', 'client', 'dist', 'uploads', 'enrollment');
                fs.mkdirSync(dir, { recursive: true });
                fs.writeFileSync(path.join(dir, filename), buffer);
                urls.push(`/uploads/enrollment/${filename}`);
            }
        }
        if (!urls.length) return res.status(400).json({ error: 'No valid image data found' });
        res.json({ success: true, urls });
    } catch (err) {
        console.error('[TerminalRoutes] Enrollment image upload failed:', err);
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
