/**
 * attendanceService.js — attendance for staff and drivers.
 *
 * Design note: neither staff nor drivers interact with this system. They have no
 * app knowledge, so the capture model is:
 *
 *   Yard staff — a supervisor runs a visual roll-call. Everyone defaults to
 *                present; the supervisor only marks the exceptions.
 *   Drivers    — attendance is DERIVED from work already recorded. A driver with
 *                a voucher or a fuel log on a date was demonstrably working, so
 *                the system proposes "present" with the evidence attached. The
 *                supervisor only has to resolve days with no evidence.
 *
 * Derived days are always proposals. Nothing is written until a supervisor saves,
 * and every stored record keeps `source` so a derived day is distinguishable from
 * a hand-marked one later.
 */

const localStore = require('../utils/localStore');
const { db, admin, isAvailable } = require('../firebase');
const { getCol } = require('../utils/collectionUtils');

const ATTENDANCE_COL = 'attendance';
const PROFILE_COL = 'profiles';
const VOUCHERS_COL = 'vouchers';
const FUEL_LOGS_COL = 'fuel_logs';

const STATUSES = ['present', 'absent', 'half_day', 'leave'];

// Attendance covers drivers and staff only.
//   Tyre / Manual — suppliers, not people on the payroll (VENDOR_TYPES in
//                   StaffProfileModule.jsx).
//   Pump          — a fuel station, not a person. Legacy records store this
//                   lowercase, which is why the comparison is case-insensitive.
//   Labour        — tracked separately through the labour module, not here.
// Defined as an exclusion so a new employee type added later is included by
// default rather than silently vanishing from the roll-call.
// 'Firm' — custom-category firms from Admin → Firms & Vendors, companies not people.
// 'Expense' — expense profiles (like Office Spend), not people.
const NON_ATTENDING_TYPES = ['Tyre', 'Manual', 'Pump', 'Labour', 'Firm', 'Expense'];
const NON_ATTENDING_LOOKUP = new Set(NON_ATTENDING_TYPES.map(t => t.toLowerCase()));
const isAttendingType = (type) => !NON_ATTENDING_LOOKUP.has(String(type || '').trim().toLowerCase());

const firebaseAvailable = () => isAvailable();

// ── Normalisation ────────────────────────────────────────────────────────────
// Driver names are typed by hand in vouchers and again in profiles, so they must
// be compared loosely — case, extra spaces, and punctuation all vary in practice.
const nameKey = (value) =>
    String(value ?? '').toLowerCase().replace(/[^a-z0-9ऀ-ॿ]/g, '');

// Truck numbers appear as "HR55 AB 1234", "hr55ab1234", "HR-55-AB-1234".
const truckKey = (value) =>
    String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

const isValidDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ''));

// The yard's calendar day, not the server's. Cloud Run runs in UTC, so between
// midnight and 05:30 IST a UTC "today" is still yesterday — a roll-call opened
// early in the morning would default to the wrong day.
// en-CA formats as YYYY-MM-DD, which is exactly the shape stored on records.
const BUSINESS_TIMEZONE = process.env.ATTENDANCE_TIMEZONE || process.env.CRON_TIMEZONE || 'Asia/Kolkata';

const businessToday = () => {
    try {
        return new Intl.DateTimeFormat('en-CA', {
            timeZone: BUSINESS_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit',
        }).format(new Date());
    } catch {
        // Unknown timezone name — fall back rather than break every default date.
        console.warn(`[Attendance] Unknown timezone "${BUSINESS_TIMEZONE}", falling back to UTC.`);
        return new Date().toISOString().slice(0, 10);
    }
};

/** Every date string in [from, to] inclusive. Both must be YYYY-MM-DD. */
const datesBetween = (from, to) => {
    const out = [];
    const cur = new Date(`${from}T00:00:00Z`);
    const end = new Date(`${to}T00:00:00Z`);
    while (cur <= end) {
        out.push(cur.toISOString().slice(0, 10));
        cur.setUTCDate(cur.getUTCDate() + 1);
    }
    return out;
};

/** First and last day of a YYYY-MM month. */
const monthBounds = (month) => {
    const [y, m] = month.split('-').map(Number);
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` };
};

// ── Profiles ─────────────────────────────────────────────────────────────────

/**
 * Profiles that should appear in a roll-call on `date`.
 * Excludes anyone who had not joined yet or who has already left.
 */
const getAttendingProfiles = async (orgId, req, date) => {
    let docs;
    if (firebaseAvailable()) {
        const snap = await db.collection(getCol(PROFILE_COL, req)).get();
        docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } else {
        docs = localStore.getAll(PROFILE_COL);
    }

    return docs
        .filter(p => !orgId || !p.orgId || p.orgId === orgId)
        .filter(p => isAttendingType(p.type))
        .filter(p => {
            // dateJoined / dateExit are optional; only exclude when they clearly apply.
            if (date && isValidDate(p.dateJoined) && p.dateJoined > date) return false;
            if (date && isValidDate(p.dateExit) && p.dateExit < date) return false;
            return true;
        })
        .sort((a, b) => {
            // Drivers first (they carry derived evidence), then alphabetical.
            if ((a.type === 'Driver') !== (b.type === 'Driver')) return a.type === 'Driver' ? -1 : 1;
            return String(a.name || '').localeCompare(String(b.name || ''));
        });
};

// ── Driver derivation ────────────────────────────────────────────────────────

/**
 * Work evidence per driver over a date range.
 *
 * Returns { [profileId]: { [date]: [{ type, ref, truckNo }] } }
 *
 * Three signals in descending order of confidence:
 *   1. voucher.driverId  — the driver picked on the voucher form. Exact.
 *   2. voucher.driverName — older vouchers, and any typed by hand. Fuzzy match.
 *   3. voucher.truckNo / fuel_log.truckNo against the driver's assigned vehicleNo.
 *      Weakest: it assumes the usual driver drove, which is why the voucher form
 *      lets the user override the driver when a relief driver takes the truck.
 */
const deriveDriverActivity = async (orgId, req, { from, to, profiles }) => {
    const drivers = (profiles || []).filter(p => p.type === 'Driver');
    if (!drivers.length) return {};

    // Lookup tables from each signal back to profile ids. A truck can be
    // assigned to more than one driver over time, so map to a list.
    const byId = new Set(drivers.map(d => d.id));
    const byName = new Map();
    const byTruck = new Map();
    for (const d of drivers) {
        const nk = nameKey(d.name);
        if (nk) byName.set(nk, d.id);
        const tk = truckKey(d.vehicleNo);
        if (tk) {
            if (!byTruck.has(tk)) byTruck.set(tk, []);
            byTruck.get(tk).push(d.id);
        }
    }

    let vouchers = [];
    let fuelLogs = [];
    if (firebaseAvailable()) {
        // Range-bounded so this stays cheap as history grows.
        const [vSnap, fSnap] = await Promise.all([
            db.collection(getCol(VOUCHERS_COL, req))
                .where('orgId', '==', orgId)
                .where('date', '>=', from).where('date', '<=', to)
                .get()
                .catch(() => null),
            db.collection(getCol(FUEL_LOGS_COL, req))
                .where('orgId', '==', orgId)
                .where('date', '>=', from).where('date', '<=', to)
                .get()
                .catch(() => null),
        ]);
        // A missing composite index makes the ranged query fail. Fall back to an
        // unfiltered read and filter in memory rather than losing the evidence.
        vouchers = vSnap
            ? vSnap.docs.map(d => ({ id: d.id, ...d.data() }))
            : (await db.collection(getCol(VOUCHERS_COL, req)).where('orgId', '==', orgId).get())
                .docs.map(d => ({ id: d.id, ...d.data() }))
                .filter(v => v.date >= from && v.date <= to);
        fuelLogs = fSnap
            ? fSnap.docs.map(d => ({ id: d.id, ...d.data() }))
            : (await db.collection(getCol(FUEL_LOGS_COL, req)).where('orgId', '==', orgId).get()
                .catch(() => ({ docs: [] })))
                .docs.map(d => ({ id: d.id, ...d.data() }))
                .filter(v => v.date >= from && v.date <= to);
    } else {
        const inRange = (d) => d.date >= from && d.date <= to;
        vouchers = localStore.getAll(VOUCHERS_COL).filter(v => v.orgId === orgId && inRange(v));
        fuelLogs = localStore.getAll(FUEL_LOGS_COL).filter(f => f.orgId === orgId && inRange(f));
    }

    const evidence = {};
    const record = (profileId, date, item) => {
        if (!profileId || !isValidDate(date)) return;
        if (!evidence[profileId]) evidence[profileId] = {};
        if (!evidence[profileId][date]) evidence[profileId][date] = [];
        // One entry per source ref, so re-reading doesn't inflate the count.
        const dup = evidence[profileId][date].some(e => e.type === item.type && e.ref === item.ref);
        if (!dup) evidence[profileId][date].push(item);
    };

    for (const v of vouchers) {
        // An explicitly chosen driver is authoritative — it is the whole point of
        // the field, and it is how a relief driver gets credited instead of the
        // person the truck is normally assigned to.
        if (v.driverId && byId.has(v.driverId)) {
            record(v.driverId, v.date, { type: 'trip', ref: v.lrNo || v.id, truckNo: v.truckNo || null });
            continue;
        }
        const named = byName.get(nameKey(v.driverName));
        if (named) {
            record(named, v.date, { type: 'trip', ref: v.lrNo || v.id, truckNo: v.truckNo || null });
            continue;
        }
        for (const id of byTruck.get(truckKey(v.truckNo)) || []) {
            record(id, v.date, { type: 'vehicle', ref: v.lrNo || v.id, truckNo: v.truckNo || null });
        }
    }

    for (const f of fuelLogs) {
        for (const id of byTruck.get(truckKey(f.truckNo)) || []) {
            record(id, f.date, { type: 'fuel', ref: f.id, truckNo: f.truckNo || null });
        }
    }

    return evidence;
};

// ── Stored records ───────────────────────────────────────────────────────────

/** Attendance rows for a date range. Range-scoped rather than reading everything. */
const getRange = async (orgId, req, { from, to, profileId }) => {
    let docs;
    if (firebaseAvailable()) {
        const col = db.collection(getCol(ATTENDANCE_COL, req));
        const snap = await col.where('date', '>=', from).where('date', '<=', to).get()
            .catch(async () => col.get()); // no index yet — fall back, filter below
        docs = snap.docs.map(d => ({ id: d.id, ...d.data() }))
            .filter(d => d.date >= from && d.date <= to);
    } else {
        docs = localStore.getAll(ATTENDANCE_COL).filter(d => d.date >= from && d.date <= to);
    }
    if (orgId) docs = docs.filter(d => !d.orgId || d.orgId === orgId);
    if (profileId) docs = docs.filter(d => d.profileId === profileId);
    return docs.sort((a, b) => String(b.date).localeCompare(String(a.date)));
};

/**
 * The roll-call for one date: every attending profile, the status already saved
 * (if any), and a suggested status for anyone not yet marked.
 *
 * Suggestion rules — drivers on an active tour (IN_DUTY from terminal or supervisor)
 * remain proposed present for all tour days, drivers with trip evidence get "present",
 * and staff default to "present" because the supervisor marks exceptions rather than the whole yard.
 */
const getRoster = async (orgId, req, date) => {
    const profiles = await getAttendingProfiles(orgId, req, date);

    // Look back up to 14 days before `date` to detect active multi-day driver duties and recent activity
    const lookbackDate = new Date(new Date(`${date}T00:00:00Z`).getTime() - 14 * 86400000).toISOString().slice(0, 10);

    const [saved, recentAttendance, evidence] = await Promise.all([
        getRange(orgId, req, { from: date, to: date }),
        getRange(orgId, req, { from: lookbackDate, to: date }),
        deriveDriverActivity(orgId, req, { from: lookbackDate, to: date, profiles }),
    ]);

    const savedByProfile = new Map(saved.map(r => [r.profileId, r]));

    // Group recent attendance by profile to evaluate active tour state
    const recentByProfile = new Map();
    for (const r of recentAttendance) {
        if (!recentByProfile.has(r.profileId)) recentByProfile.set(r.profileId, []);
        recentByProfile.get(r.profileId).push(r);
    }

    const rows = profiles.map(p => {
        const existing = savedByProfile.get(p.id) || null;
        const dayEvidence = evidence[p.id]?.[date] || [];
        const isDriver = p.type === 'Driver';

        let suggested;
        let suggestedBy;
        let activeDuty = null;
        let idleWarning = false;
        let idleDays = 0;
        let idleReason = null;

        if (isDriver) {
            // Find most recent attendance record with a duty state on or before `date`
            const driverRecs = (recentByProfile.get(p.id) || [])
                .filter(r => r.date <= date)
                .sort((a, b) => String(b.date).localeCompare(String(a.date)));

            const latestDutyRec = driverRecs.find(r => r.dutyState);
            const isCurrentlyInDuty = latestDutyRec && (
                String(latestDutyRec.dutyState).toLowerCase() === 'in_duty'
            );

            if (isCurrentlyInDuty) {
                // Find initial start record for this continuous tour
                const tourStartRec = [...driverRecs].reverse().find(r =>
                    String(r.dutyState).toLowerCase() === 'in_duty'
                ) || latestDutyRec;

                activeDuty = {
                    startDate: tourStartRec.date,
                    inTime: tourStartRec.inTime || tourStartRec.punchTime,
                    method: tourStartRec.method || 'face',
                    terminalId: tourStartRec.terminalId || 'VGTC-TERMINAL-01'
                };

                // Check for idle warning: days since last trip/voucher or tour start
                const allEvidenceDates = Object.keys(evidence[p.id] || {}).filter(d => d <= date).sort().reverse();
                const lastActivityDate = allEvidenceDates[0] || activeDuty.startDate;

                const msDiff = new Date(`${date}T00:00:00Z`).getTime() - new Date(`${lastActivityDate}T00:00:00Z`).getTime();
                idleDays = Math.max(0, Math.floor(msDiff / 86400000));
                if (idleDays >= 2) {
                    idleWarning = true;
                    idleReason = `No voucher/movement for ${idleDays} day${idleDays > 1 ? 's' : ''}`;
                }
            }

            if (dayEvidence.length) {
                suggested = 'present';
                suggestedBy = 'trip_data';
            } else if (isCurrentlyInDuty) {
                // Driver is on a continuous multi-day tour
                suggested = 'present';
                suggestedBy = 'duty_cycle';
            } else {
                suggested = null;
                suggestedBy = null;
            }
        } else {
            suggested = 'present';
            suggestedBy = 'default';
        }

        const effectiveDutyState = existing?.dutyState || (activeDuty ? 'in_duty' : null);

        // Augment day evidence with active tour info if applicable
        const finalEvidence = [...dayEvidence];
        if (activeDuty && !dayEvidence.some(e => e.type === 'tour')) {
            finalEvidence.unshift({
                type: 'tour',
                ref: `Tour started ${activeDuty.startDate}`,
                truckNo: p.vehicleNo || null,
                detail: activeDuty.inTime ? `Punched in at ${activeDuty.inTime}` : 'On duty tour'
            });
        }

        return {
            profileId: p.id,
            name: p.name || '',
            type: p.type || '',
            department: p.department || '',
            photo: p.photo || null,
            vehicleNo: p.vehicleNo || '',
            status: existing?.status || null,     // what is already saved
            suggested,                            // what to pre-select when unsaved
            suggestedBy,                          // 'trip_data' | 'duty_cycle' | 'default' | null
            evidence: finalEvidence,              // proof shown next to driver tiles
            activeDuty,                           // tour details if driver is currently in_duty
            idleWarning,                          // true if driver is in_duty >= 2 days with no voucher
            idleDays,                             // number of days without trip
            idleReason,                           // human readable explanation
            markedBy: existing?.markedByName || null,
            markedAt: existing?.markedAt || null,
            source: existing?.source || (activeDuty ? 'terminal' : null),
            method: existing?.method || activeDuty?.method || null,
            terminalId: existing?.terminalId || activeDuty?.terminalId || null,
            punchTime: existing?.punchTime || existing?.markedAt || null,
            inTime: existing?.inTime || activeDuty?.inTime || null,
            outTime: existing?.outTime || null,
            durationHours: existing?.durationHours || null,
            dutyDays: existing?.dutyDays ?? (existing?.status === 'present' ? 1.0 : (existing?.status === 'half_day' ? 0.5 : 0.0)),
            dutyState: effectiveDutyState,
            overrideReason: existing?.overrideReason || null,
        };
    });

    return {
        date,
        rows,
        counts: {
            total: rows.length,
            saved: rows.filter(r => r.status).length,
            derived: rows.filter(r => r.suggestedBy === 'trip_data' || r.suggestedBy === 'duty_cycle').length,
            unresolved: rows.filter(r => !r.status && !r.suggested).length,
        },
    };
};

/**
 * Days in the recent past whose roll-call is not finished.
 *
 * The roll-call is easy to forget, and a day that was never marked is invisible
 * until payroll — by which time nobody remembers who turned up. This is what
 * the Attendance screen shows so the gap is noticed the same week.
 *
 * Deliberately not `getRoster` per day: that derives driver evidence from
 * vouchers and fuel logs for each date, which is a lot of reading to answer a
 * question that only needs "is there a record". One profile read and one range
 * read cover the whole window.
 *
 * @param {number} days how far back to look, today included
 * @returns {Promise<{days: Array, totalPending: number, oldest: string|null}>}
 *          `days` is newest first, each `{ date, isToday, pending, total, names }`.
 */
const getPendingDays = async (orgId, req, days = 14) => {
    const to = businessToday();
    const span = Math.min(Math.max(parseInt(days, 10) || 14, 1), 60);
    const window = datesBetween(
        new Date(new Date(`${to}T00:00:00Z`).getTime() - (span - 1) * 86400000).toISOString().slice(0, 10),
        to,
    );

    const [profiles, saved] = await Promise.all([
        // Undated: joiners and leavers are filtered per day below, where the
        // date is actually known.
        getAttendingProfiles(orgId, req, null),
        getRange(orgId, req, { from: window[0], to }),
    ]);

    const markedByDate = new Map();
    saved.forEach(r => {
        if (!markedByDate.has(r.date)) markedByDate.set(r.date, new Set());
        markedByDate.get(r.date).add(r.profileId);
    });

    const out = [];
    for (const date of window) {
        const due = profiles.filter(p => {
            if (isValidDate(p.dateJoined) && p.dateJoined > date) return false;
            if (isValidDate(p.dateExit) && p.dateExit < date) return false;
            return true;
        });
        if (!due.length) continue;

        const marked = markedByDate.get(date) || new Set();
        const missing = due.filter(p => !marked.has(p.id));
        if (!missing.length) continue;   // finished — it drops off the list

        out.push({
            date,
            isToday: date === to,
            pending: missing.length,
            total: due.length,
            // Enough to recognise the gap without loading the whole roster.
            names: missing.slice(0, 6).map(p => p.name || 'Unnamed'),
        });
    }

    out.sort((a, b) => b.date.localeCompare(a.date));
    return {
        days: out,
        totalPending: out.reduce((s, d) => s + d.pending, 0),
        oldest: out.length ? out[out.length - 1].date : null,
    };
};

/**
 * Write one day's roll-call.
 *
 * Doc id is `{profileId}_{date}`, so saving the same day twice overwrites rather
 * than duplicating — the supervisor can correct a mistake by saving again.
 */
const saveBulk = async (orgId, req, { date, records, user }) => {
    if (!isValidDate(date)) throw new Error('date must be YYYY-MM-DD');
    if (!Array.isArray(records) || !records.length) throw new Error('records[] is required');

    const clean = records.map(r => {
        if (!r.profileId) throw new Error('every record needs a profileId');
        if (!STATUSES.includes(r.status)) {
            throw new Error(`invalid status "${r.status}" for ${r.profileName || r.profileId}`);
        }
        const effectiveSource = r.source === 'terminal' ? 'terminal' : (r.source === 'derived' ? 'derived' : (r.source || 'manual'));
        const nowIso = new Date().toISOString();
        return {
            profileId: String(r.profileId),
            profileName: String(r.profileName || ''),
            profileType: String(r.profileType || ''),
            status: r.status,
            note: r.note ? String(r.note).slice(0, 300) : null,
            // Where the value came from: 'terminal' (kiosk), 'derived' (trips/fuel), or 'manual' (supervisor)
            source: effectiveSource,
            method: r.method || (effectiveSource === 'terminal' ? 'face' : 'manual'),
            terminalId: r.terminalId || (effectiveSource === 'terminal' ? 'VGTC-TERMINAL-01' : null),
            vehicleNo: r.vehicleNo ? String(r.vehicleNo).trim().toUpperCase() : null,
            date,
            orgId,
            markedBy: user?.id || null,
            markedByName: user?.name || null,
            markedAt: r.markedAt || nowIso,
            createdAt: r.createdAt || r.markedAt || nowIso,
            punchTime: r.punchTime || r.markedAt || nowIso,
            inTime: r.inTime || null,
            outTime: r.outTime || null,
            durationHours: typeof r.durationHours === 'number' ? r.durationHours : (r.durationHours ? Number(r.durationHours) : null),
            dutyDays: typeof r.dutyDays === 'number' ? r.dutyDays : (r.dutyDays ? Number(r.dutyDays) : (r.status === 'present' ? 1.0 : (r.status === 'half_day' ? 0.5 : 0.0))),
            dutyState: r.dutyState || null,
            overrideReason: r.overrideReason || null,
        };
    });

    if (firebaseAvailable()) {
        const col = getCol(ATTENDANCE_COL, req);
        // Firestore caps a batch at 500 writes; chunk so a big yard cannot fail.
        for (let i = 0; i < clean.length; i += 400) {
            const batch = db.batch();
            for (const rec of clean.slice(i, i + 400)) {
                batch.set(db.collection(col).doc(`${rec.profileId}_${date}`), {
                    ...rec,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                }, { merge: true });
            }
            await batch.commit();
        }
    } else {
        for (const rec of clean) {
            const existing = localStore.getAll(ATTENDANCE_COL)
                .find(d => d.profileId === rec.profileId && d.date === date);
            if (existing) localStore.update(ATTENDANCE_COL, existing.id, rec);
            else localStore.insert(ATTENDANCE_COL, rec);
        }
    }

    return clean.map(r => ({ id: `${r.profileId}_${date}`, ...r }));
};

// ── Payroll summary ──────────────────────────────────────────────────────────

/**
 * Per-profile totals for a month, in the shape payroll needs.
 *
 * `payableDays` counts a half day as 0.5 and paid leave as a full day, but only
 * up to the profile's annual entitlement — leave beyond that is unpaid.
 * `paidLeaveUsedYTD` is counted from 1 January so the cap is applied against the
 * year, not the month.
 */
const getMonthlySummary = async (orgId, req, month) => {
    if (!/^\d{4}-\d{2}$/.test(String(month || ''))) throw new Error('month must be YYYY-MM');
    const { from, to } = monthBounds(month);
    const year = month.slice(0, 4);

    const [profiles, monthRecs, yearRecs] = await Promise.all([
        getAttendingProfiles(orgId, req, null),
        getRange(orgId, req, { from, to }),
        getRange(orgId, req, { from: `${year}-01-01`, to }),
    ]);

    const rows = profiles.map(p => {
        const recs = monthRecs.filter(r => r.profileId === p.id);
        const counts = { present: 0, absent: 0, half_day: 0, leave: 0 };
        recs.forEach(r => { if (counts[r.status] !== undefined) counts[r.status]++; });

        const entitlement = Number(p.paidLeaveEntitlement) || 0;
        // Leave taken earlier in the year already consumed part of the allowance.
        const leaveBeforeMonth = yearRecs
            .filter(r => r.profileId === p.id && r.status === 'leave' && r.date < from).length;
        const allowanceLeft = Math.max(0, entitlement - leaveBeforeMonth);
        const paidLeave = Math.min(counts.leave, allowanceLeft);
        const unpaidLeave = counts.leave - paidLeave;

        const payableDays = counts.present + counts.half_day * 0.5 + paidLeave;
        const salary = Number(p.fixedSalary) || 0;
        const daysInMonth = datesBetween(from, to).length;

        return {
            profileId: p.id,
            name: p.name || '',
            type: p.type || '',
            department: p.department || '',
            photo: p.photo || null,
            ...counts,
            marked: recs.length,
            unmarked: daysInMonth - recs.length,
            paidLeave,
            unpaidLeave,
            paidLeaveEntitlement: entitlement,
            paidLeaveRemaining: Math.max(0, allowanceLeft - paidLeave),
            payableDays,
            fixedSalary: salary,
            // Pro-rated against calendar days, matching how a monthly wage is split.
            estimatedPay: salary ? Math.round((salary / daysInMonth) * payableDays) : 0,
        };
    });

    return { month, daysInMonth: datesBetween(from, to).length, rows };
};

/**
 * Mark a driver off-duty / relieved from an active tour.
 * Sets the active duty status to completed / off_duty, records outTime, outDate, and reason.
 */
const markOffDuty = async (orgId, req, { profileId, outDate, outTime, reason, user }) => {
    if (!profileId) throw new Error('profileId is required');
    const effectiveDate = isValidDate(outDate) ? outDate : businessToday();
    const effectiveTime = outTime || new Intl.DateTimeFormat('en-IN', {
        timeZone: BUSINESS_TIMEZONE, hour: '2-digit', minute: '2-digit', hour12: true
    }).format(new Date());

    // 1. Fetch recent records for this driver to find active tour
    const lookbackDate = new Date(new Date(`${effectiveDate}T00:00:00Z`).getTime() - 30 * 86400000).toISOString().slice(0, 10);
    const recent = await getRange(orgId, req, {
        from: lookbackDate,
        to: effectiveDate,
        profileId,
    });

    const activeRecord = recent.find(r => String(r.dutyState).toLowerCase() === 'in_duty');
    const nowIso = new Date().toISOString();

    const existingDayRecord = recent.find(r => r.date === effectiveDate);
    const updatedRecord = {
        profileId: String(profileId),
        date: effectiveDate,
        orgId,
        status: existingDayRecord?.status || 'present',
        dutyState: 'completed',
        outTime: effectiveTime,
        inTime: existingDayRecord?.inTime || activeRecord?.inTime || null,
        durationHours: existingDayRecord?.durationHours || null,
        dutyDays: existingDayRecord?.dutyDays ?? 1.0,
        source: 'manual',
        method: existingDayRecord?.method || 'manual',
        overrideReason: reason || 'Marked off-duty by supervisor',
        markedBy: user?.id || null,
        markedByName: user?.name || null,
        markedAt: nowIso,
        updatedAt: nowIso,
    };

    if (firebaseAvailable()) {
        const col = getCol(ATTENDANCE_COL, req);
        const docRef = db.collection(col).doc(`${profileId}_${effectiveDate}`);
        await docRef.set({
            ...updatedRecord,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });

        // If the active record was on an earlier date, close that one too
        if (activeRecord && activeRecord.date !== effectiveDate) {
            await db.collection(col).doc(`${profileId}_${activeRecord.date}`).set({
                dutyState: 'completed',
                outDate: effectiveDate,
                outTime: effectiveTime,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });
        }
    } else {
        const existing = localStore.getAll(ATTENDANCE_COL)
            .find(d => d.profileId === profileId && d.date === effectiveDate);
        if (existing) localStore.update(ATTENDANCE_COL, existing.id, updatedRecord);
        else localStore.insert(ATTENDANCE_COL, updatedRecord);

        if (activeRecord && activeRecord.date !== effectiveDate) {
            const actDoc = localStore.getAll(ATTENDANCE_COL)
                .find(d => d.profileId === profileId && d.date === activeRecord.date);
            if (actDoc) localStore.update(ATTENDANCE_COL, actDoc.id, {
                dutyState: 'completed',
                outDate: effectiveDate,
                outTime: effectiveTime
            });
        }
    }

    return { id: `${profileId}_${effectiveDate}`, ...updatedRecord };
};

/**
 * All drivers currently on an active tour.
 */
const getActiveDuties = async (orgId, req) => {
    const today = businessToday();
    const roster = await getRoster(orgId, req, today);
    return roster.rows.filter(r => r.type === 'Driver' && r.dutyState === 'in_duty');
};

module.exports = {
    STATUSES,
    NON_ATTENDING_TYPES,
    isAttendingType,
    businessToday,
    BUSINESS_TIMEZONE,
    getAttendingProfiles,
    deriveDriverActivity,
    getRange,
    getRoster,
    getPendingDays,
    saveBulk,
    getMonthlySummary,
    markOffDuty,
    getActiveDuties,
    // exported for tests
    _internal: { nameKey, truckKey, datesBetween, monthBounds },
};
