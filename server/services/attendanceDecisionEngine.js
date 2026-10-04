/**
 * attendanceDecisionEngine.js — Intelligent VGTC Terminal Biometric Decision Engine
 *
 * Implements the core logic defined in "VGTC OS — Terminal Specification":
 * 1. Face / Biometric Recognition event processing.
 * 2. Rapid scan debounce protection.
 * 3. Driver trip state resolution (AVAILABLE -> ON_TRIP -> TRIP_RETURN).
 * 4. Staff office check-in / check-out / emergency leave calculation.
 * 5. Event logging and automatic sync into VGTC daily attendance records & punch logs.
 */

const { db, isAvailable } = require('../firebase');
const localStore = require('../utils/localStore');
const { getEnvCol } = require('../utils/collectionUtils');
const crypto = require('crypto');
const { cleanupEnrollmentImages } = require('./enrollmentImageCleanup');
const { isProduction } = require('../utils/envConfig');
const requireDatabase = () => {
    if (isProduction() && (!isAvailable() || !db)) throw Object.assign(new Error('VGTC database unavailable; retry when server reconnects'), { status: 503 });
};
const { sendEventNotification } = require('../utils/whatsappService');

const ATTENDANCE_EVENTS_COL = 'attendance_events';
const ATTENDANCE_COL = 'attendance';
const PROFILES_COL = 'profiles';
const VOUCHERS_COL = 'vouchers';
const LRS_COL = 'lrs';
const TERMINALS_COL = 'terminals';

// In-memory rapid debounce scan cache: employeeId -> timestamp (ms)
const recentScans = new Map();
const DUPLICATE_WINDOW_MS = 4 * 1000; // 4 seconds camera micro-burst debounce

const clean = s => String(s || '').trim();
const upper = s => clean(s).toUpperCase().replace(/\s+/g, '');
// Mirror /api/profiles exactly: profile type/status flags never hide a row.
// Actual portal deletion removes the document, checked again for every event.
const isPortalProfile = p => Boolean(p);
const attendanceEnabled = p => p.attendanceEnabled !== false;

/**
 * Returns today's date as a YYYY-MM-DD string in Asia/Kolkata timezone.
 * Always produces a valid ISO date — never 'Invalid Date'.
 */
const todayStr = () => {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date()).reduce((m, p) => (m[p.type] = p.value, m), {});
    return `${parts.year}-${parts.month}-${parts.day}`;
};

/**
 * Converts a timestamp (ms) to YYYY-MM-DD in IST.
 * Guarantees a valid string — falls back to todayStr() if conversion fails.
 */
const msToDateStr = (ms) => {
    try {
        const d = new Date(ms);
        if (isNaN(d.getTime())) return todayStr();
        const parts = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit'
        }).formatToParts(d).reduce((m, p) => (m[p.type] = p.value, m), {});
        return `${parts.year}-${parts.month}-${parts.day}`;
    } catch (_) { return todayStr(); }
};

/**
 * Salary day counter — only counts hours between 06:00 and 22:00 IST per
 * calendar date. Overnight hours (22:00–06:00) are excluded from pay.
 *
 * @param {number} inMs   Punch-in timestamp (ms)
 * @param {number} outMs  Punch-out timestamp (ms)
 * @returns {number}      Salary days (0.0 / 0.5 / 1.0)
 */
const calcSalaryDays = (inMs, outMs) => {
    if (!inMs || !outMs || outMs <= inMs) return 0.0;
    const DAY_START_H = 6;  // 06:00 IST
    const DAY_END_H   = 22; // 22:00 IST

    let totalBillableMs = 0;
    // Iterate over each calendar date spanned by [inMs, outMs]
    let cursor = inMs;
    while (cursor < outMs) {
        const dateStr = msToDateStr(cursor);
        // Build day window boundaries for that calendar date in IST
        const dayStartMs = new Date(`${dateStr}T0${DAY_START_H}:00:00+05:30`).getTime();
        const dayEndMs   = new Date(`${dateStr}T${DAY_END_H}:00:00+05:30`).getTime();
        const windowStart = Math.max(cursor, dayStartMs);
        const windowEnd   = Math.min(outMs, dayEndMs);
        if (windowEnd > windowStart) {
            totalBillableMs += (windowEnd - windowStart);
        }
        // Advance to start of next calendar day (midnight IST)
        const nextDay = new Date(`${dateStr}T00:00:00+05:30`);
        nextDay.setDate(nextDay.getDate() + 1);
        cursor = nextDay.getTime();
    }
    const totalBillableHours = totalBillableMs / (1000 * 3600);
    if (totalBillableHours >= 8) return 1.0;
    if (totalBillableHours >= 4) return 0.5;
    return 0.0;
};

// One Firestore listener per server instance: polling HTTP clients share its
// snapshot. Deletions propagate across instances without rereading the roster.
let rosterSnapshotPromise;
let attemptsSnapshotPromise;
async function getRosterProfiles() {
    requireDatabase();
    if (!isAvailable() || !db) return localStore.getAll(PROFILES_COL) || [];
    if (!rosterSnapshotPromise) {
        rosterSnapshotPromise = new Promise((resolve, reject) => {
            const unsubscribe = db.collection(getEnvCol(PROFILES_COL)).onSnapshot(snapshot => {
                const rows = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
                rosterSnapshotPromise = Promise.resolve(rows);
                resolve(rows);
            }, error => {
                rosterSnapshotPromise = null;
                reject(error);
                unsubscribe();
            });
        });
    }
    return rosterSnapshotPromise;
}

async function getDocs(colName) {
    requireDatabase();
    if (isAvailable() && db) {
        try {
            const actualCol = getEnvCol ? getEnvCol(colName) : colName;
            const snap = await db.collection(actualCol).get();
            return snap.docs.map(d => ({ id: d.id, ...d.data() }));
        } catch (e) {
            throw e; // Never authorize against stale local data after a server read failure.
        }
    }
    return localStore.getAll(colName) || [];
}

async function getDoc(colName, id) {
    requireDatabase();
    if (isAvailable() && db) {
        const snap = await db.collection(getEnvCol(colName)).doc(id).get();
        if (snap.exists) return { ...snap.data(), id: snap.id };

        // Fallback: match by data id field in case Firestore document key differs from profile id
        try {
            const qSnap = await db.collection(getEnvCol(colName)).where('id', '==', id).limit(1).get();
            if (!qSnap.empty) {
                const d = qSnap.docs[0];
                return { ...d.data(), id: d.id, profileId: id };
            }
        } catch (_) {}

        return null;
    }
    return localStore.getById(colName, id);
}

async function insertDoc(colName, data) {
    requireDatabase();
    const docId = data.id || crypto.randomUUID();
    const payload = { ...data, id: docId, updatedAt: new Date().toISOString() };

    if (isAvailable() && db) {
        try {
            const actualCol = getEnvCol ? getEnvCol(colName) : colName;
            await db.collection(actualCol).doc(docId).set(payload, { merge: true });
            return payload;
        } catch (e) {
            throw e;
        }
    }
    if (localStore.getById(colName, docId)) { localStore.update(colName, docId, payload); return payload; }
    return localStore.insert(colName, payload);
}

const attendanceDecisionEngine = {
    /**
     * Get active fleet and staff roster for the terminal (used for local identification and face matching)
     */
    async getTerminalRoster(terminalId = '') {
        const profiles = await getRosterProfiles();

        const today = todayStr();

        // Separate drivers and staff
        const driverList = [];
        const staffList = [];

        profiles.filter(isPortalProfile).forEach(p => {
            const type = String(p.type || p.profileType || '').toLowerCase();
            const primaryPhoto = p.facePhoto || p.photo || p.photoUrl || (p.photos && p.photos.length > 0 ? p.photos[0] : null);
            const isEnrolled = Boolean(primaryPhoto || p.faceEnrolled || (p.faceEmbedding && p.faceEmbedding.length > 0));

            if (type.includes('driver')) {
                const pPhone = clean(p.mobile || p.phone);
                const status = p.dutyState || 'AVAILABLE';
                const activeTrip = p.activeTrip || null;

                driverList.push({
                    id: p.id,
                    employeeId: p.employeeId || `DRV-${p.id.slice(-4).toUpperCase()}`,
                    name: p.name,
                    attendanceEnabled: attendanceEnabled(p),
                    profileType: p.profileType || p.type || 'Staff',
                    phone: pPhone,
                    type: 'DRIVER',
                    assignedTruck: p.vehicleNo || p.truckNo || '',
                    faceEnrolled: isEnrolled,
                    photoUrl: primaryPhoto,
                    photo: primaryPhoto,
                    photos: p.photos || (primaryPhoto ? [primaryPhoto] : []),
                    faceEmbedding: p.faceEmbedding || p.faceEmbedding512 || null,
                    fingerprintEnrolled: terminalId ? Number.isInteger(p.fingerprints?.[terminalId]) : Boolean(p.fingerprintEnrolled),
                    fingerprintSlotId: terminalId ? (p.fingerprints?.[terminalId] ?? null) : null,
                    status, // AVAILABLE | ON_TRIP | LOADED
                    activeTrip
                });
            } else {
                staffList.push({
                    id: p.id,
                    employeeId: p.employeeId || `EMP-${p.id.slice(-4).toUpperCase()}`,
                    name: p.name,
                    attendanceEnabled: attendanceEnabled(p),
                    profileType: p.profileType || p.type || 'Staff',
                    phone: clean(p.mobile || p.phone),
                    type: 'STAFF',
                    department: p.department || p.type || 'Office',
                    faceEnrolled: isEnrolled,
                    photoUrl: primaryPhoto,
                    photo: primaryPhoto,
                    photos: p.photos || (primaryPhoto ? [primaryPhoto] : []),
                    faceEmbedding: p.faceEmbedding || p.faceEmbedding512 || null,
                    fingerprintEnrolled: terminalId ? Number.isInteger(p.fingerprints?.[terminalId]) : Boolean(p.fingerprintEnrolled),
                    fingerprintSlotId: terminalId ? (p.fingerprints?.[terminalId] ?? null) : null,
                    status: 'ACTIVE'
                });
            }
        });

        return {
            date: today,
            drivers: driverList,
            staff: staffList,
            vehicles: []
        };
    },

    /**
     * Process an incoming attendance scan or terminal action
     * Handles ALL conditions:
     * - CHECK_IN (Morning shift start)
     * - CHECK_OUT (Shift end / 8h complete / Tour complete)
     * - EMERGENCY_EXIT (Early departure authorized by Admin)
     * - GATE_PASS (Re-scan while shift is active)
     * - TRIP_RETURN (Driver returned from active trip)
     * - MANUAL_OVERRIDE (Admin override via pencil menu)
     */
    async processEvent(body = {}) {
        const {
            eventId,
            terminalId = 'OFFICE-REWARI-01',
            timestamp,
            notes = '',
            isTest = false
        } = body;
        const employeeId = body.employeeId || body.profileId || body.personId || body.id;
        const biometricMethod = (body.biometricMethod || body.method || 'FACE').toUpperCase();

        const now = timestamp ? new Date(timestamp) : new Date();
        const nowMs = now.getTime();
        if (!Number.isFinite(nowMs)) throw Object.assign(new Error('Invalid timestamp'), { status: 400 });
        const date = msToDateStr(nowMs);
        const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });

        // Resolve action
        let action = (body.action || '').toUpperCase();
        if (!action || action === 'AUTO') {
            if (body.dutyState?.includes('emergency') || body.method?.includes('emergency')) {
                action = 'EMERGENCY_EXIT';
            } else if (body.outTime || body.dutyState === 'COMPLETED' || body.dutyState === 'OFF_DUTY') {
                action = 'CHECK_OUT';
            } else if (body.dutyState === 'GATE_PASS') {
                action = 'GATE_PASS';
            } else if (body.overrideReason) {
                action = 'MANUAL_OVERRIDE';
            } else {
                action = 'CHECK_IN';
            }
        }

        // 2. Fetch full profile and latest trip state
        let current;
        try { current = await this.requireActiveProfile(employeeId); }
        catch (error) {
            if (![400, 404].includes(error.status)) throw error;
            return { status: 'UNKNOWN_EMPLOYEE', message: error.message, employeeId };
        }
        const person = {
            ...current,
            employeeId: current.employeeId || current.id,
            phone: current.phone || current.mobile || '',
            assignedTruck: current.vehicleNo || current.truckNo || '',
            fingerprintSlotId: current.fingerprints?.[terminalId] ?? null,
        };
        const driver = /driver/i.test(current.type || current.profileType || '') ? person : null;
        if (!attendanceEnabled(current) || action === 'BLOCKED_ATTEMPT') return this.recordStoppedAttempt(body, current);
        // 1. Debounce rapid repeat attempts (4 seconds), only for AUTO/CHECK_IN
        const lastScanTime = recentScans.get(employeeId);
        if (!isTest && lastScanTime && (nowMs - lastScanTime < DUPLICATE_WINDOW_MS) && action === 'CHECK_IN') {
            const elapsedSec = Math.round((nowMs - lastScanTime) / 1000);
            return {
                status: 'DUPLICATE',
                message: `Attendance recently scanned ${elapsedSec}s ago. Please wait a moment.`,
                employeeId,
                terminalId,
                duplicateCooldownSec: Math.max(0, 4 - elapsedSec)
            };
        }

        if (biometricMethod === 'FINGERPRINT' && person &&
            (!Number.isInteger(body.fingerprintSlotId) || body.fingerprintSlotId !== person.fingerprintSlotId)) {
            return { status: 'FINGERPRINT_MISMATCH', message: 'Fingerprint ID is not enrolled for this employee on this terminal.' };
        }

        if (!person) {
            return {
                status: 'UNKNOWN_EMPLOYEE',
                message: `No active employee or driver found for ID/Phone "${employeeId}"`,
                employeeId
            };
        }

        const isDriver = !!driver;
        let eventType = action;

        // Auto-resolve trip state if AUTO was supplied
        if (action === 'AUTO' && isDriver && (driver.status === 'ON_TRIP' || driver.status === 'LOADED')) {
            eventType = 'PROMPT_TRIP_RETURN';
        }

        let tripDetails = driver?.activeTrip || null;

        // Resolve Status, DutyState, and Punch Time
        let recordStatus = 'present';
        let dutyState = 'IN_DUTY';
        let responseMsg = '';
        const punchTimeVal = body.punchTime || body.outTime || body.inTime || timeStr;

        if (eventType === 'CHECK_IN') {
            recordStatus = 'present';
            dutyState = 'IN_DUTY';
            responseMsg = `Shift started for ${person.name} at ${punchTimeVal} (Present)`;
        } else if (eventType === 'CHECK_OUT') {
            recordStatus = body.status || 'present';
            dutyState = isDriver ? 'OFF_DUTY' : 'COMPLETED';
            const durStr = body.durationHours ? ` (${body.durationHours} hrs)` : '';
            responseMsg = `Shift completed for ${person.name} at ${punchTimeVal}${durStr}`;
        } else if (eventType === 'EMERGENCY_EXIT') {
            recordStatus = body.status || (body.durationHours >= 4.0 ? 'half_day' : 'leave');
            dutyState = 'EMERGENCY_LEAVE';
            responseMsg = `Emergency early exit approved for ${person.name} at ${punchTimeVal} (${recordStatus.toUpperCase()})`;
        } else if (eventType === 'GATE_PASS') {
            recordStatus = 'present';
            dutyState = 'IN_DUTY';
            responseMsg = `Gate visit recorded for ${person.name} at ${punchTimeVal} (Shift in progress)`;
        } else if (eventType === 'TRIP_RETURN') {
            recordStatus = 'present';
            dutyState = 'AVAILABLE';
            responseMsg = `Welcome back, ${person.name}! Trip return recorded.`;
        } else if (eventType === 'DUTY_CONTINUES' || eventType === 'DUTY_IN_PROGRESS' || body.action === 'DUTY_CONTINUES') {
            recordStatus = 'duty_continues';
            dutyState = 'IN_DUTY';
            eventType = 'DUTY_CONTINUES';
            responseMsg = `Active duty continues for ${person.name} (scanned ${biometricMethod.toLowerCase()} again at ${punchTimeVal})`;
        } else if (eventType === 'MANUAL_OVERRIDE') {
            recordStatus = body.status || 'present';
            dutyState = body.dutyState || (recordStatus === 'present' ? 'IN_DUTY' : 'COMPLETED');
            responseMsg = `Attendance override recorded for ${person.name} (${recordStatus.toUpperCase()})`;
        } else {
            recordStatus = body.status || 'present';
            dutyState = body.dutyState || 'IN_DUTY';
            responseMsg = `Attendance punch recorded for ${person.name} at ${punchTimeVal}`;
        }

        // 3. Create immutable attendance event record for audit & sync logs
        const eventRecord = {
            id: eventId || crypto.randomUUID(),
            employeeId: person.id,
            employeeCode: person.employeeId,
            employeeName: person.name,
            employeeType: isDriver ? 'DRIVER' : 'STAFF',
            terminalId,
            eventType,
            action: eventType,
            biometricMethod,
            fingerprintSlotId: biometricMethod === 'FINGERPRINT' ? body.fingerprintSlotId : null,
            method: biometricMethod.toLowerCase(),
            status: recordStatus,
            dutyState,
            inTime: body.inTime || (eventType === 'CHECK_IN' ? timeStr : null),
            outTime: body.outTime || ((eventType === 'CHECK_OUT' || eventType === 'EMERGENCY_EXIT') ? timeStr : null),
            punchTime: punchTimeVal,
            durationHours: body.durationHours != null ? Number(body.durationHours) : null,
            dutyDays: body.dutyDays != null ? Number(body.dutyDays) : (recordStatus === 'present' ? 1.0 : (recordStatus === 'half_day' ? 0.5 : 0.0)),
            overrideReason: body.overrideReason || null,
            timestamp: now.toISOString(),
            date,
            time: timeStr,
            tripDetails,
            notes: notes || body.overrideReason || '',
            syncStatus: 'SYNCED',
            createdAt: now.toISOString()
        };
        const writes = [[ATTENDANCE_EVENTS_COL, eventRecord]];

        // Update recent scans cache


        // 4. Insert dedicated punch log into `attendance` collection so the "Punch Logs" table shows EVERY punch
        const punchDocId = `punch_${date}_${person.id}_${nowMs}_${eventType.toLowerCase()}`;
        const isDriverRecord = !!driver;
        const locationLabel = isDriverRecord ? 'Yard' : 'Office';

        const punchRecord = {
            id: punchDocId,
            date,  // guaranteed YYYY-MM-DD
            profileId: person.id,
            profileName: person.name,
            profileType: isDriver ? 'Driver' : (person.department || 'Staff'),
            vehicleNo: person.vehicleNo || person.assignedTruck || body.vehicleNo || null,
            status: recordStatus,
            location: locationLabel,
            source: 'terminal',
            terminalId,
            terminalEvent: eventType,
            eventType: eventType,
            action: eventType,
            dutyState,
            terminalTime: punchTimeVal,
            punchTime: punchTimeVal,
            inTime: body.inTime || (eventType === 'CHECK_IN' ? timeStr : null),
            outTime: body.outTime || ((eventType === 'CHECK_OUT' || eventType === 'EMERGENCY_EXIT') ? timeStr : null),
            durationHours: body.durationHours != null ? Number(body.durationHours) : null,
            // Salary days count only 6AM-10PM hours
            dutyDays: (() => {
                if (body.dutyDays != null) return Number(body.dutyDays);
                if (eventType === 'CHECK_OUT' && body.inTimeMs && nowMs) {
                    return calcSalaryDays(Number(body.inTimeMs), nowMs);
                }
                return recordStatus === 'present' ? 1.0 : (recordStatus === 'half_day' ? 0.5 : 0.0);
            })(),
            overrideReason: body.overrideReason || null,
            note: notes || body.overrideReason || (eventType === 'EMERGENCY_EXIT' ? 'Emergency Early Departure' : eventType === 'GATE_PASS' ? 'Gate Pass / Active Duty' : ''),
            markedAt: now.toISOString(),
            createdAt: now.toISOString(),
            method: biometricMethod.toLowerCase(),
            updatedAt: now.toISOString(),
            isPunchLog: true
        };
        writes.push([ATTENDANCE_COL, punchRecord]);

        // 5. Update daily summary attendance record
        let summaryDoc = null;
        try {
            const summaryDocId = `${person.id}_${date}`;
            const existingSummary = await getDoc(ATTENDANCE_COL, summaryDocId) || await getDoc(ATTENDANCE_COL, `${date}_${person.id}`);

            const firstIn = existingSummary?.inTime || body.inTime || (eventType === 'CHECK_IN' ? timeStr : null);
            const lastOut = ((eventType === 'CHECK_OUT' || eventType === 'EMERGENCY_EXIT') ? (body.outTime || timeStr) : existingSummary?.outTime) || null;

            // Salary-day recalculation: only bill 6AM-10PM hours
            const salaryDays = (() => {
                if (body.dutyDays != null) return Number(body.dutyDays);
                if (eventType === 'CHECK_OUT' && body.inTimeMs && nowMs) {
                    return calcSalaryDays(Number(body.inTimeMs), nowMs);
                }
                return existingSummary?.dutyDays != null ? existingSummary.dutyDays
                    : (recordStatus === 'present' ? 1.0 : (recordStatus === 'half_day' ? 0.5 : 0.0));
            })();

            // Location label for portal display
            const locationLabel = isDriver ? 'Yard' : 'Office';

            summaryDoc = {
                ...(existingSummary || {}),
                id: summaryDocId,
                date,  // always YYYY-MM-DD
                profileId: person.id,
                profileName: person.name,
                profileType: isDriver ? 'Driver' : (person.department || 'Staff'),
                vehicleNo: person.vehicleNo || person.assignedTruck || body.vehicleNo || existingSummary?.vehicleNo || null,
                status: (eventType === 'EMERGENCY_EXIT') ? recordStatus : (eventType === 'CHECK_OUT' ? (body.status || 'present') : (existingSummary?.status || recordStatus)),
                location: locationLabel,
                dutyState,
                source: 'terminal',
                terminalId,
                terminalEvent: eventType,
                terminalTime: punchTimeVal,
                punchTime: punchTimeVal,
                inTime: firstIn,
                inTimeMs: existingSummary?.inTimeMs || body.inTimeMs || (eventType === 'CHECK_IN' ? nowMs : null),
                outTimeMs: ['CHECK_OUT', 'EMERGENCY_EXIT'].includes(eventType) ? nowMs : existingSummary?.outTimeMs || null,
                outTime: lastOut,
                durationHours: body.durationHours != null ? Number(body.durationHours) : existingSummary?.durationHours || null,
                dutyDays: salaryDays,
                overrideReason: body.overrideReason || existingSummary?.overrideReason || null,
                markedAt: now.toISOString(),
                createdAt: existingSummary?.createdAt || now.toISOString(),
                method: biometricMethod.toLowerCase(),
                updatedAt: now.toISOString(),
                isDailySummary: true
            };
            writes.push([ATTENDANCE_COL, summaryDoc]);
        } catch (attErr) {
            throw attErr; // Never report a successful punch when its portal summary failed.
        }

        if (isAvailable() && db) {
            // Verify employee still exists in the transaction; commit all four
            // portal records together, or none of them.
            try { await db.runTransaction(async transaction => {
                const active = await transaction.get(db.collection(getEnvCol(PROFILES_COL)).doc(person.id));
                if (!active.exists || !isPortalProfile(active.data())) throw Object.assign(new Error('Employee deleted'), { status: 404 });
                if (!attendanceEnabled(active.data())) throw Object.assign(new Error('Attendance stopped from VGTC Portal'), { code: 'ATTENDANCE_STOPPED' });
                for (const [collection, record] of writes) transaction.set(db.collection(getEnvCol(collection)).doc(record.id), record, { merge: true });
            }); } catch (error) {
                if (error.code === 'ATTENDANCE_STOPPED') return this.recordStoppedAttempt(body, current);
                throw error;
            }
        } else {
            for (const [collection, record] of writes) await insertDoc(collection, record);
        }
        recentScans.set(employeeId, nowMs);

        // Notify the employee only for the beginning/end of a duty period. Gate
        // passes and duplicate scans stay silent so WhatsApp does not become noisy.
        const attendanceMessageKey = eventType === 'CHECK_IN'
            ? 'attendance_duty_started'
            : (['CHECK_OUT', 'EMERGENCY_EXIT', 'TRIP_RETURN'].includes(eventType)
                ? 'attendance_punch_out'
                : null);
        if (attendanceMessageKey && person.phone) {
            const duration = body.durationHours != null ? Number(body.durationHours) : summaryDoc?.durationHours;
            void sendEventNotification(attendanceMessageKey, {
                staffName: person.name,
                staffType: isDriver ? 'Driver' : (person.department || 'Staff'),
                date,
                punchTime: punchTimeVal,
                punchMethod: biometricMethod === 'FINGERPRINT' ? 'OTG Fingerprint' : 'Face Verification',
                attendanceStatus: String(recordStatus || 'present').replace('_', ' ').toUpperCase(),
                vehicleLine: (person.vehicleNo || person.assignedTruck)
                    ? `*Vehicle:* ${person.vehicleNo || person.assignedTruck}`
                    : '',
                durationLine: Number.isFinite(duration) ? `*Duty Duration:* ${duration.toFixed(2)} hours` : '',
                reasonLine: body.overrideReason ? `*Reason:* ${body.overrideReason}` : '',
            }, [person.phone]);
        }

        return {
            status: 'SUCCESS',
            eventType,
            action: eventType,
            message: responseMsg,
            person,
            tripDetails,
            statusType: recordStatus,
            dutyState,
            inTime: summaryDoc?.inTime || body.inTime || timeStr,
            outTime: summaryDoc?.outTime || body.outTime || null,
            punchTime: punchTimeVal,
            time: punchTimeVal,
            date,
            terminalId,
            punchId: punchDocId,
            eventId: eventRecord.id
        };
    },

    async recordStoppedAttempt(body, profile) {
        const timestamp = new Date().toISOString();
        const event = {
            id: crypto.randomUUID(), employeeId: profile.id, employeeName: profile.name || '',
            terminalId: clean(body.terminalId), biometricMethod: String(body.biometricMethod || body.method || 'FACE').toUpperCase(),
            fingerprintSlotId: Number.isInteger(body.fingerprintSlotId) ? body.fingerprintSlotId : null,
            eventType: 'ATTENDANCE_STOPPED', status: 'ATTENDANCE_STOPPED', timestamp,
            date: todayStr(), message: attendanceEnabled(profile) && body.action === 'BLOCKED_ATTEMPT' ? 'Scan blocked by terminal paused state; refresh roster' : 'Attendance stopped from VGTC Portal',
            reason: attendanceEnabled(profile) && body.action === 'BLOCKED_ATTEMPT' ? 'TERMINAL_PAUSED_STATE' : 'PORTAL_ATTENDANCE_STOPPED',
        };
        await insertDoc(ATTENDANCE_EVENTS_COL, event);
        return { status: 'ATTENDANCE_STOPPED', eventType: event.eventType, message: event.message, eventId: event.id, person: { id: profile.id, name: profile.name }, date: event.date };
    },

    async setAttendanceEnabled(profileIds, enabled) {
        if (!Array.isArray(profileIds) || !profileIds.length || profileIds.length > 400 || typeof enabled !== 'boolean' || profileIds.some(id => typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(id))) throw Object.assign(new Error('1–400 profileIds and boolean attendanceEnabled required'), { status: 400 });
        const ids = [...new Set(profileIds)];
        const patch = { attendanceEnabled: enabled, attendanceUpdatedAt: new Date().toISOString() };
        if (isAvailable() && db) {
            await db.runTransaction(async transaction => {
                const refs = ids.map(id => db.collection(getEnvCol(PROFILES_COL)).doc(id));
                const profiles = await transaction.getAll(...refs);
                if (profiles.some(p => !p.exists || !isPortalProfile(p.data()))) throw Object.assign(new Error('One or more profiles no longer exist; refresh roster'), { status: 404 });
                refs.forEach(ref => transaction.update(ref, patch));
            });
        } else {
            await Promise.all(ids.map(id => this.requireActiveProfile(id)));
            ids.forEach(id => localStore.update(PROFILES_COL, id, patch));
        }
        return { profileIds: ids, ...patch };
    },

    async getAttempts() {
        requireDatabase();
        if (!isAvailable() || !db) return [...localStore.getAll(ATTENDANCE_EVENTS_COL)].filter(event => event.eventType === 'ATTENDANCE_STOPPED').sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp))).slice(0, 200);
        // One filtered listener serves every portal polling request. Composite
        // index definition lives in server/firestore.indexes.json.
        if (!attemptsSnapshotPromise) {
            attemptsSnapshotPromise = new Promise((resolve, reject) => {
                const unsubscribe = db.collection(getEnvCol(ATTENDANCE_EVENTS_COL))
                    .where('eventType', '==', 'ATTENDANCE_STOPPED').orderBy('timestamp', 'desc').limit(200)
                    .onSnapshot(snapshot => {
                        const events = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
                        attemptsSnapshotPromise = Promise.resolve(events);
                        resolve(events);
                    }, error => { attemptsSnapshotPromise = null; reject(error); unsubscribe(); });
            });
        }
        return attemptsSnapshotPromise;
    },

    async getDuty(profileId) {
        await this.requireActiveProfile(profileId);
        const date = todayStr();
        const record = await getDoc(ATTENDANCE_COL, `${profileId}_${date}`) || await getDoc(ATTENDANCE_COL, `${date}_${profileId}`);
        if (!record) return null;
        const parseTime = value => {
            if (!value) return 0;
            const match = String(value).match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?$/i);
            if (!match) return 0;
            let hour = Number(match[1]);
            if (match[4]) hour = hour % 12 + (/pm/i.test(match[4]) ? 12 : 0);
            return new Date(`${date}T${String(hour).padStart(2, '0')}:${match[2]}:${match[3] || '00'}+05:30`).getTime();
        };
        return { ...record, inTimeMs: record.inTimeMs || parseTime(record.inTime), outTimeMs: record.outTimeMs || parseTime(record.outTime), inTimeFormatted: record.inTime || '', outTimeFormatted: record.outTime || '' };
    },

    async requireActiveProfile(id) {
        if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(id)) throw Object.assign(new Error('Valid profile ID required'), { status: 400 });
        const existing = await getDoc(PROFILES_COL, id);
        if (!existing || !isPortalProfile(existing)) throw Object.assign(new Error('Employee is not active in VGTC. Refresh the staff list.'), { status: 404 });
        return existing;
    },

    async enrollPerson(body = {}) {
        const docId = body.id || body.personId || body.profileId;
        const existing = await this.requireActiveProfile(docId);
        const payload = { updatedAt: new Date().toISOString() };
        let replacedProfile = existing;
        const photos = body.photos ?? (body.photo || body.facePhoto || body.photoUrl ? [body.photo || body.facePhoto || body.photoUrl] : undefined);
        if (photos !== undefined) {
            const prefix = `/api/terminal/enrollment-images/${encodeURIComponent(docId)}/`;
            if (!Array.isArray(photos) || !photos.length || photos.length > 10 || photos.some(url => typeof url !== 'string' || !url.startsWith(prefix) || !/^[a-f0-9-]+\.(jpg|png)$/.test(url.slice(prefix.length)))) {
                throw Object.assign(new Error('Upload enrollment photos before saving their server URLs.'), { status: 400 });
            }
            const selected = body.photo || body.facePhoto || body.photoUrl || photos[0];
            if (!photos.includes(selected)) throw Object.assign(new Error('Profile photo must belong to the uploaded gallery.'), { status: 400 });
            Object.assign(payload, { photos, photo: selected, facePhoto: selected, photoUrl: selected, faceEnrolled: true });
        }
        const embedding = body.faceEmbedding || body.embedding;
        if (embedding !== undefined) {
            if (!Array.isArray(embedding) || ![128, 192, 512].includes(embedding.length) || !embedding.every(Number.isFinite)) throw Object.assign(new Error('Invalid face embedding'), { status: 400 });
            payload.faceEmbedding = embedding;
        }
        if (body.fingerprintSlotId !== undefined) {
            const terminalId = clean(body.terminalId);
            const slot = body.fingerprintSlotId;
            if (!/^[A-Za-z0-9_-]{1,100}$/.test(terminalId) || !Number.isInteger(slot) || slot < 0 || slot > 65535) throw Object.assign(new Error('Valid terminalId and sensor fingerprintSlotId required.'), { status: 400 });
            const profiles = isAvailable() && db ? [] : await getDocs(PROFILES_COL);
            if (profiles.some(p => p.id !== docId && isPortalProfile(p) && p.fingerprints?.[terminalId] === slot)) throw Object.assign(new Error('Fingerprint ID already belongs to another employee on this terminal.'), { status: 409 });
            payload.fingerprints = { ...(existing.fingerprints || {}), [terminalId]: slot };
            payload.fingerprintSlotId = slot;
            payload.fingerprintEnrolled = true;
        }
        // Update-only prevents resurrecting a profile deleted between read and write.
        if (isAvailable() && db) {
            const collection = db.collection(getEnvCol(PROFILES_COL));
            await db.runTransaction(async transaction => {
                const current = await transaction.get(collection.doc(docId));
                replacedProfile = current.data();
                if (!current.exists || !isPortalProfile(current.data())) throw Object.assign(new Error('Employee deleted or inactive'), { status: 404 });
                if (body.fingerprintSlotId !== undefined) {
                    const owners = await transaction.get(collection.where(`fingerprints.${clean(body.terminalId)}`, '==', body.fingerprintSlotId));
                    if (owners.docs.some(p => p.id !== docId && isPortalProfile(p.data()))) throw Object.assign(new Error('Fingerprint ID already belongs to another employee on this terminal.'), { status: 409 });
                    payload.fingerprints = { ...(current.data().fingerprints || {}), [clean(body.terminalId)]: body.fingerprintSlotId };
                }
                transaction.update(collection.doc(docId), payload);
            });
        }
        else {
            if (!localStore.getById(PROFILES_COL, docId)) throw Object.assign(new Error('Employee deleted'), { status: 404 });
            localStore.update(PROFILES_COL, docId, payload);
        }
        if (photos !== undefined) await cleanupEnrollmentImages(docId, replacedProfile, payload);
        return { ...existing, ...payload };
    },

    async deleteEnrollment(id, biometricType = 'face') {
        const cleanId = String(id || '').trim();
        const profiles = await getDocs(PROFILES_COL);
        const existing = profiles.find(p => p.id === cleanId || p.employeeId === cleanId || p._docId === cleanId);
        if (!existing) return { success: false, message: 'Person not found' };

        const payload = {
            ...existing,
            updatedAt: new Date().toISOString()
        };

        if (biometricType === 'face' || biometricType === 'all') {
            payload.facePhoto = null;
            payload.photo = null;
            payload.photoUrl = null;
            payload.photos = [];
            payload.faceEnrolled = false;
            payload.faceEmbedding = null;
            payload.faceEmbedding512 = null;
        }

        if (biometricType === 'fingerprint' || biometricType === 'all') {
            payload.fingerprintEnrolled = false;
            payload.fingerprintSlotId = null;
            payload.fingerprints = {};
        }

        await insertDoc(PROFILES_COL, payload);

        // Also update by Firestore document ID if different
        if (isAvailable() && db) {
            try {
                const actualCol = getEnvCol ? getEnvCol(PROFILES_COL) : PROFILES_COL;
                if (existing._docId && existing._docId !== payload.id) {
                    await db.collection(actualCol).doc(existing._docId).set(payload, { merge: true });
                }
                const qSnap = await db.collection(actualCol).where('id', '==', cleanId).get();
                for (const d of qSnap.docs) {
                    await d.ref.set(payload, { merge: true });
                }
            } catch (_) {}
        }

        if (biometricType === 'face' || biometricType === 'all') {
            await cleanupEnrollmentImages(cleanId, existing, payload);
        }
        return { success: true };
    },

    async assignVehicle(driverId, vehicleNo) {
        const profiles = await getDocs(PROFILES_COL);
        const existing = profiles.find(p => p.id === driverId);
        if (!existing) return { success: false, message: 'Driver not found' };

        const payload = {
            ...existing,
            vehicleNo,
            truckNo: vehicleNo,
            updatedAt: new Date().toISOString()
        };
        await insertDoc(PROFILES_COL, payload);
        return { success: true, vehicleNo };
    }
};

module.exports = attendanceDecisionEngine;
