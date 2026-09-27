const express = require('express');
const router = express.Router();
const attendanceService = require('../services/attendanceService');
const auditService = require('../services/auditService');
const { requirePermission } = require('../middleware/auth');
const { tenancyMiddleware } = require('../middleware/tenancyMiddleware');

const ATTENDANCE_COL = 'attendance';

// Terminal kiosk token — allows biometric devices to write attendance
// records without needing a full user JWT with attendance permissions.
const TERMINAL_TOKEN = process.env.TERMINAL_KEY || 'VGTC-TERMINAL-TOKEN-KEY';

/**
 * Middleware that accepts either a valid terminal token OR a normal user auth
 * token with attendance view permission. This is necessary because the Android
 * terminal app authenticates with a static device token, not a user JWT.
 */
const attendanceOrTerminalAuth = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.slice(7).trim();
        if (token === TERMINAL_TOKEN) {
            // Terminal device — inject admin context with org from header
            req.user = {
                id: 'vgtc-terminal',
                name: 'VGTC Terminal Kiosk',
                role: 'admin',
                orgId: req.headers['x-org-id'] || 'vgtc',
                permissions: { attendance: 'delete' }
            };
            // tenancyMiddleware expects req.orgId
            req.orgId = req.user.orgId;
            return next();
        }
    }
    // Fall through to normal permission check
    return requirePermission('attendance', 'view')(req, res, next);
};

// Everything here is org-scoped and needs at least view access. Writes ask for
// 'edit' individually below — the client also hides the controls, but the check
// that matters is this one.
router.use(attendanceOrTerminalAuth, (req, res, next) => {
    // tenancyMiddleware sets req.orgId from the JWT — terminal requests
    // already have req.orgId set above, so skip if already populated.
    if (req.orgId) return next();
    return tenancyMiddleware(req, res, next);
});

// The yard's calendar day, not the server's UTC day — see attendanceService.
const today = () => attendanceService.businessToday();
const isDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ''));

/**
 * GET /api/attendance/roster?date=YYYY-MM-DD
 *
 * The roll-call screen. Returns every profile who should be present that day,
 * what has already been saved, and a suggested status for anyone unmarked —
 * drivers from their trip evidence, everyone else defaulting to present.
 */
router.get('/roster', async (req, res, next) => {
    try {
        const date = isDate(req.query.date) ? req.query.date : today();
        res.json(await attendanceService.getRoster(req.orgId, req, date));
    } catch (err) { next(err); }
});

/**
 * GET /api/attendance/pending?days=14
 *
 * Recent days whose roll-call is unfinished, newest first. A day drops off as
 * soon as everyone on it is marked, so the list empties itself.
 */
router.get('/pending', async (req, res, next) => {
    try {
        // Fix #6: cap the days window so a caller cannot trigger an
        // arbitrarily large Firestore scan.
        const days = Math.min(Math.max(parseInt(req.query.days) || 14, 1), 90);
        res.json(await attendanceService.getPendingDays(req.orgId, req, days));
    } catch (err) { next(err); }
});

/**
 * GET /api/attendance/summary?month=YYYY-MM
 * Per-profile payroll totals: payable days, paid vs unpaid leave, estimated pay.
 */
router.get('/summary', async (req, res, next) => {
    try {
        const month = req.query.month || today().slice(0, 7);
        res.json(await attendanceService.getMonthlySummary(req.orgId, req, month));
    } catch (err) {
        if (/must be/.test(err.message)) return res.status(400).json({ error: err.message });
        next(err);
    }
});

/**
 * GET /api/attendance/evidence?profileId=&from=&to=
 * The trip/fuel records behind a driver's derived days, for auditing a dispute.
 */
router.get('/evidence', async (req, res, next) => {
    try {
        const { profileId } = req.query;
        if (!profileId) return res.status(400).json({ error: 'profileId is required' });
        const to = isDate(req.query.to) ? req.query.to : today();
        const from = isDate(req.query.from) ? req.query.from : `${to.slice(0, 7)}-01`;

        const profiles = await attendanceService.getAttendingProfiles(req.orgId, req, null);
        const profile = profiles.find(p => p.id === profileId);
        if (!profile) return res.status(404).json({ error: 'Profile not found' });

        const evidence = await attendanceService.deriveDriverActivity(req.orgId, req, {
            from, to, profiles: [profile],
        });
        res.json({ profileId, from, to, days: evidence[profileId] || {} });
    } catch (err) { next(err); }
});

/**
 * GET /api/attendance?from=&to=&profileId=&month=
 * Raw saved records. Defaults to the current month rather than the whole
 * collection so this stays cheap as history builds up.
 */
router.get('/', async (req, res, next) => {
    try {
        const { month, profileId } = req.query;
        let { from, to } = req.query;

        if (month && /^\d{4}-\d{2}$/.test(month)) {
            const [y, m] = month.split('-').map(Number);
            from = `${month}-01`;
            to = `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;
        }
        if (!isDate(from) || !isDate(to)) {
            const t = today();
            from = `${t.slice(0, 7)}-01`;
            to = t;
        }
        if (from > to) return res.status(400).json({ error: '"from" must not be after "to"' });

        // Fix #7: reject date ranges that would cause an oversized DB scan.
        const diffDays = (new Date(to).getTime() - new Date(from).getTime()) / 86400000;
        // A single profile's biometric history is used by the terminal detail
        // card and may span years. Keep the broad limit only for that scoped
        // request; unscoped portal queries remain capped at 93 days.
        if (diffDays > (profileId ? 40000 : 93)) {
            return res.status(400).json({ error: `Date range cannot exceed ${profileId ? 40000 : 93} days` });
        }

        res.json(await attendanceService.getRange(req.orgId, req, { from, to, profileId }));
    } catch (err) { next(err); }
});

/**
 * POST /api/attendance/bulk — save one day's roll-call.
 * Body: { date, records: [{ profileId, profileName, profileType, status, note?, source? }] }
 */
router.post('/bulk', requirePermission('attendance', 'edit'), async (req, res, next) => {
    try {
        const { date, records } = req.body;
        const saved = await attendanceService.saveBulk(req.orgId, req, {
            date, records, user: req.user,
        });

        auditService.logAction({
            orgId: req.orgId,
            action: auditService.ACTIONS.ATTENDANCE_MARKED,
            performedBy: req.user.id,
            performedByName: req.user.name,
            targetId: date,
            targetType: 'attendance',
            before: null,
            after: {
                date,
                count: saved.length,
                present: saved.filter(r => r.status === 'present').length,
                absent: saved.filter(r => r.status === 'absent').length,
                half_day: saved.filter(r => r.status === 'half_day').length,
                leave: saved.filter(r => r.status === 'leave').length,
            },
        });

        res.json({ message: 'Attendance saved', saved: saved.length, records: saved });
    } catch (err) {
        if (/required|invalid|must be/i.test(err.message)) {
            return res.status(400).json({ error: err.message });
        }
        next(err);
    }
});

/**
 * GET /api/attendance/active-duties
 * Active driver tours currently on duty.
 */
router.get('/active-duties', async (req, res, next) => {
    try {
        res.json(await attendanceService.getActiveDuties(req.orgId, req));
    } catch (err) { next(err); }
});

/**
 * POST /api/attendance/off-duty — mark a driver off-duty / relieve them from an active tour.
 * Body: { profileId, outDate?, outTime?, reason? }
 */
router.post('/off-duty', requirePermission('attendance', 'edit'), async (req, res, next) => {
    try {
        const { profileId, outDate, outTime, reason } = req.body;
        if (!profileId) return res.status(400).json({ error: 'profileId is required' });

        const record = await attendanceService.markOffDuty(req.orgId, req, {
            profileId, outDate, outTime, reason, user: req.user,
        });

        auditService.logAction({
            orgId: req.orgId,
            action: auditService.ACTIONS.ATTENDANCE_MARKED,
            performedBy: req.user.id,
            performedByName: req.user.name,
            targetId: `${profileId}_${record.date}`,
            targetType: 'attendance',
            before: null,
            after: {
                profileId,
                date: record.date,
                status: record.status,
                dutyState: record.dutyState,
                outTime: record.outTime,
                reason: record.overrideReason,
            },
        });

        res.json({ message: 'Driver marked off-duty', record });
    } catch (err) {
        if (/required|invalid|must be/i.test(err.message)) {
            return res.status(400).json({ error: err.message });
        }
        next(err);
    }
});

/** POST /api/attendance — mark a single person. */
router.post('/', requirePermission('attendance', 'edit'), async (req, res, next) => {
    try {
        const { date } = req.body;
        const [saved] = await attendanceService.saveBulk(req.orgId, req, {
            date, records: [req.body], user: req.user,
        });
        res.json(saved);
    } catch (err) {
        if (/required|invalid|must be/i.test(err.message)) {
            return res.status(400).json({ error: err.message });
        }
        next(err);
    }
});

/** DELETE /api/attendance/:id — clear a mark (id is `{profileId}_{date}`). */
router.delete('/:id', requirePermission('attendance', 'delete'), async (req, res, next) => {
    try {
        const { db, isAvailable } = require('../firebase');
        const { getCol } = require('../utils/collectionUtils');
        const localStore = require('../utils/localStore');

        if (!isAvailable()) localStore.delete(ATTENDANCE_COL, req.params.id);
        else await db.collection(getCol(ATTENDANCE_COL, req)).doc(req.params.id).delete();

        auditService.logAction({
            orgId: req.orgId,
            action: auditService.ACTIONS.ATTENDANCE_DELETED,
            performedBy: req.user.id,
            performedByName: req.user.name,
            targetId: req.params.id,
            targetType: 'attendance',
            before: null,
            after: null,
        });

        res.json({ message: 'Deleted' });
    } catch (err) { next(err); }
});

module.exports = router;
