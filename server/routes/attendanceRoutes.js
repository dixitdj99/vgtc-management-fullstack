const express = require('express');
const router = express.Router();
const attendanceService = require('../services/attendanceService');
const auditService = require('../services/auditService');
const { requirePermission } = require('../middleware/auth');
const { tenancyMiddleware } = require('../middleware/tenancyMiddleware');

const ATTENDANCE_COL = 'attendance';

// Everything here is org-scoped and needs at least view access. Writes ask for
// 'edit' individually below — the client also hides the controls, but the check
// that matters is this one.
router.use(requirePermission('attendance', 'view'), tenancyMiddleware);

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
