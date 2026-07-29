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
const NON_ATTENDING_TYPES = ['Tyre', 'Manual', 'Pump', 'Labour', 'Firm'];
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
 * Suggestion rules — drivers get "present" only with evidence, staff default to
 * "present" because the supervisor marks exceptions rather than the whole yard.
 */
const getRoster = async (orgId, req, date) => {
    const profiles = await getAttendingProfiles(orgId, req, date);
    const [saved, evidence] = await Promise.all([
        getRange(orgId, req, { from: date, to: date }),
        deriveDriverActivity(orgId, req, { from: date, to: date, profiles }),
    ]);

    const savedByProfile = new Map(saved.map(r => [r.profileId, r]));

    const rows = profiles.map(p => {
        const existing = savedByProfile.get(p.id) || null;
        const dayEvidence = evidence[p.id]?.[date] || [];
        const isDriver = p.type === 'Driver';

        let suggested;
        let suggestedBy;
        if (isDriver) {
            // No evidence is not proof of absence — a driver can be mid-trip with
            // nothing recorded that day. Leave it unset so the supervisor decides.
            suggested = dayEvidence.length ? 'present' : null;
            suggestedBy = dayEvidence.length ? 'trip_data' : null;
        } else {
            suggested = 'present';
            suggestedBy = 'default';
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
            suggestedBy,                          // 'trip_data' | 'default' | null
            evidence: dayEvidence,                // proof shown next to driver tiles
            markedBy: existing?.markedByName || null,
            markedAt: existing?.markedAt || null,
            source: existing?.source || null,
        };
    });

    return {
        date,
        rows,
        counts: {
            total: rows.length,
            saved: rows.filter(r => r.status).length,
            derived: rows.filter(r => r.suggestedBy === 'trip_data').length,
            unresolved: rows.filter(r => !r.status && !r.suggested).length,
        },
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
        return {
            profileId: String(r.profileId),
            profileName: String(r.profileName || ''),
            profileType: String(r.profileType || ''),
            status: r.status,
            note: r.note ? String(r.note).slice(0, 300) : null,
            // Where the value came from, so a hand-correction stays visible later.
            source: r.source === 'derived' ? 'derived' : 'manual',
            date,
            orgId,
            markedBy: user?.id || null,
            markedByName: user?.name || null,
            markedAt: new Date().toISOString(),
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
    saveBulk,
    getMonthlySummary,
    // exported for tests
    _internal: { nameKey, truckKey, datesBetween, monthBounds },
};
