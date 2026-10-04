/**
 * terminalRoutes.js — API endpoints for VGTC OS Terminal
 */

const express = require('express');
const router = express.Router();
const { permits } = require('../middleware/auth');
router.use((req, res, next) => {
    // Terminal operates the single VGTC production roster; sandbox and foreign
    // organisations must never read or mutate these unscoped legacy collections.
    if (req.user?.isSandbox || (req.user?.orgId && req.user.orgId !== 'vgtc')) return res.status(403).json({ error: 'Terminal supports the VGTC organisation only' });
    if (req.user?.id !== 'vgtc-terminal' && !permits(req.user, 'attendance', req.path === '/enroll/delete' ? 'delete' : req.method === 'GET' ? 'view' : 'edit')) return res.status(403).json({ error: 'Attendance permission required' });
    next();
});
const attendanceDecisionEngine = require('../services/attendanceDecisionEngine');
const crypto = require('crypto');
const { getEnvCol } = require('../utils/collectionUtils');
const { admin, db, isAvailable } = require('../firebase');
const localStore = require('../utils/localStore');
const terminalKeyStore = require('../utils/terminalKeyStore');
const fs = require('fs');
const path = require('path');
const { publishAttendanceChange } = require('../services/attendanceRealtime');

// Active terminals in-memory / storage registry
const terminalRegistry = Object.create(null);

/**
 * GET /api/terminal/roster
 * Downloads active fleet & staff roster for on-device matching
 */
router.get('/roster', async (req, res) => {
    try {
        const roster = await attendanceDecisionEngine.getTerminalRoster(String(req.query.terminalId || ''));
        res.set('Cache-Control', 'no-store');
        res.json({ success: true, ...roster });
    } catch (err) {
        console.error('[TerminalRoutes] Failed to fetch roster:', err);
        res.status(err.status || 500).json({ success: false, error: err.message });
    }
});

router.post('/attendance-control', async (req, res) => {
    if (req.user?.id === 'vgtc-terminal') return res.status(403).json({ error: 'Attendance controls belong to VGTC Portal' });
    try {
        const result = await attendanceDecisionEngine.setAttendanceEnabled(req.body.profileIds, req.body.attendanceEnabled);
        publishAttendanceChange({ type: 'profiles.changed', action: 'attendance-control', ...result });
        res.json({ success: true, ...result });
    } catch (err) { res.status(err.status || 500).json({ error: err.message }); }
});

router.get('/attempts', async (req, res) => {
    try { res.set('Cache-Control', 'no-store').json({ success: true, events: await attendanceDecisionEngine.getAttempts() }); }
    catch (err) { res.status(err.status || 500).json({ error: err.message }); }
});

router.get('/duty/:profileId', async (req, res) => {
    try {
        const activeDuty = await attendanceDecisionEngine.getDuty(req.params.profileId);
        res.set('Cache-Control', 'no-store').json({ success: true, activeDuty });
    } catch (err) { res.status(err.status || 500).json({ error: err.message }); }
});

/**
 * GET /api/terminal/config
 * Retrieves active terminal configuration & API Key
 */
router.get('/config', async (req, res) => {
    try {
        const terminalKey = await terminalKeyStore.getTerminalKey();
        res.set('Cache-Control', 'no-store').json({
            success: true,
            terminalKey,
            defaultKey: terminalKeyStore.DEFAULT_KEY
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * POST /api/terminal/config
 * Generates or updates terminal API key permanently
 */
router.post('/config', async (req, res) => {
    if (req.user?.id === 'vgtc-terminal') return res.status(403).json({ error: 'Admin access required' });
    try {
        const newKey = req.body?.terminalKey || `VGTC-TERM-${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
        await terminalKeyStore.setTerminalKey(newKey, req.user);
        res.json({ success: true, terminalKey: newKey });
    } catch (err) {
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
        if (['SUCCESS', 'ATTENDANCE_STOPPED'].includes(result.status)) {
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
        res.status(err.status || 500).json({ status: 'ERROR', message: err.message });
    }
});

/**
 * POST /api/terminal/sync
 * Batch uploads offline queued events
 */
router.post('/sync', async (req, res) => {
    try {
        const { events = [] } = req.body;
        if (!Array.isArray(events) || events.length > 100) return res.status(400).json({ error: 'At most 100 events per sync' });
        const results = [];

        for (const evt of events) {
            try {
                const resItem = await attendanceDecisionEngine.processEvent(evt);
                results.push({ eventId: evt.eventId, status: resItem.status, message: resItem.message });
                if (['SUCCESS', 'ATTENDANCE_STOPPED'].includes(resItem.status)) {
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
        res.status(err.status || 500).json({ success: false, error: err.message });
    }
});

/**
 * POST /api/terminal/enroll
 * Enrolls or updates face/fingerprint biometric data and assigned vehicle
 */
router.post('/enroll', async (req, res) => {
    try {
        const result = await attendanceDecisionEngine.enrollPerson(req.body);
        publishAttendanceChange({ type: 'profiles.changed', action: 'enroll', profileId: result.id });
        res.json({ success: true, person: result });
    } catch (err) {
        console.error('[TerminalRoutes] Enroll failed:', err);
        res.status(err.status || 500).json({ success: false, error: err.message });
    }
});

// Phone files are backed up to private storage. Only authenticated API URLs are
// exposed; a file:// phone path cannot be reached by an internet portal.
const IMAGE_DIR = path.join(__dirname, '..', 'data', 'enrollment');
const validId = value => /^[A-Za-z0-9_-]{1,128}$/.test(value);
const imageObject = (profileId, filename) => `${getEnvCol('enrollment')}/${profileId}/${filename}`;
const storageBucket = () => {
    const bucketName = process.env.FIREBASE_STORAGE_BUCKET;
    if (!bucketName) return null;
    try {
        return admin.storage().bucket(bucketName);
    } catch (_e) {
        return null;
    }
};
router.post('/enroll-images', async (req, res) => {
    try {
        const profileId = String(req.body.profileId || '');
        const photos = req.body.photos;
        if (!validId(profileId) || !Array.isArray(photos) || !photos.length || photos.length > 10) return res.status(400).json({ error: 'Existing profileId and 1–10 photos required' });
        await attendanceDecisionEngine.requireActiveProfile(profileId);
        const images = photos.map(value => {
            const match = typeof value === 'string' && value.match(/^data:image\/(jpeg|png);base64,([A-Za-z0-9+/]+={0,2})$/);
            if (!match) throw Object.assign(new Error('Only JPEG or PNG base64 images supported'), { status: 400 });
            const buffer = Buffer.from(match[2], 'base64');
            const png = match[1] === 'png';
            const valid = png ? buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255;
            if (!valid || buffer.length > 2 * 1024 * 1024) throw Object.assign(new Error('Invalid image or image exceeds 2 MB'), { status: 400 });
            return { buffer, mime: `image/${match[1]}`, filename: `${crypto.randomUUID()}.${png ? 'png' : 'jpg'}` };
        });
        if (!isAvailable() && (process.env.K_SERVICE || process.env.NODE_ENV === 'production')) throw Object.assign(new Error('Durable Firebase image storage is unavailable'), { status: 503 });
        const urls = [];
        for (const { buffer, mime, filename } of images) {
            const bucket = isAvailable() ? storageBucket() : null;
            if (bucket) {
                await bucket.file(imageObject(profileId, filename)).save(buffer, { metadata: { contentType: mime, cacheControl: 'private,no-store' } });
            } else {
                const dir = path.join(IMAGE_DIR, profileId);
                await fs.promises.mkdir(dir, { recursive: true });
                await fs.promises.writeFile(path.join(dir, filename), buffer);
            }
            urls.push(`/api/terminal/enrollment-images/${profileId}/${filename}`);
        }
        res.json({ success: true, urls });
    } catch (err) {
        console.error('[TerminalRoutes] Enrollment image upload failed:', err);
        res.status(err.status || 500).json({ success: false, error: err.message });
    }
});

router.get('/enrollment-images/:profileId/:filename', async (req, res) => {
    try {
        const { profileId, filename } = req.params;
        if (!validId(profileId) || !/^[a-f0-9-]+\.(jpg|png)$/.test(filename)) return res.sendStatus(404);
        await attendanceDecisionEngine.requireActiveProfile(profileId);
        res.set({ 'Cache-Control': 'private,no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Type': filename.endsWith('.png') ? 'image/png' : 'image/jpeg' });
        const bucket = isAvailable() ? storageBucket() : null;
        if (bucket) {
            try {
                const [buffer] = await bucket.file(imageObject(profileId, filename)).download();
                return res.send(buffer);
            } catch (err) {
                const localPath = path.join(IMAGE_DIR, profileId, filename);
                if (fs.existsSync(localPath)) {
                    const buffer = await fs.promises.readFile(localPath);
                    return res.send(buffer);
                }
                throw err;
            }
        } else {
            const buffer = await fs.promises.readFile(path.join(IMAGE_DIR, profileId, filename));
            res.send(buffer);
        }
    } catch (err) {
        res.status(err.status || (err.code === 'ENOENT' || err.code === 404 ? 404 : 500)).json({ error: 'Enrollment image unavailable' });
    }
});

/**
 * POST /api/terminal/enroll/delete
 * Deletes / clears biometric enrollment for a person
 */
router.post('/enroll/delete', async (req, res) => {
    try {
        const id = req.body?.id || req.body?.employeeId || req.body?.profileId;
        const biometricType = req.body?.biometricType || 'face';
        const result = await attendanceDecisionEngine.deleteEnrollment(id, biometricType);
        publishAttendanceChange({ type: 'profiles.changed', action: 'clear-enrollment', profileId: id });
        res.json(result);
    } catch (err) {
        console.error('[TerminalRoutes] Delete enrollment failed:', err);
        res.status(err.status || 500).json({ success: false, error: err.message });
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
        res.status(err.status || 500).json({ success: false, error: err.message });
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
        terminals: Object.values(terminalRegistry).map(terminal => ({ ...terminal, status: Date.now() - Date.parse(terminal.lastSeen) < 90000 ? 'ONLINE' : 'OFFLINE' }))
    });
});

module.exports = router;
