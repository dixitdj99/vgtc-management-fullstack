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
const NON_PERSON_PROFILE_RE = /^(tyre|manual|pump|fuel|fuel pump|fuel station|firm|expense|labour)$/i;
const isBiometricPerson = (p) => [p.type, p.profileType, p.department, p.category, p.name]
    .map(clean)
    .every(v => !NON_PERSON_PROFILE_RE.test(v) && !/fuel\s*(pump|station)/i.test(v));

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

async function getDocs(colName) {
    if (isAvailable() && db) {
        try {
            const actualCol = getEnvCol ? getEnvCol(colName) : colName;
            const snap = await db.collection(actualCol).get();
            return snap.docs.map(d => ({ id: d.id, ...d.data() }));
        } catch (e) {
            console.warn(`[DecisionEngine] Firestore read failed for ${colName}, falling back to localStore:`, e.message);
        }
    }
    return localStore.getAll(colName) || [];
}

async function insertDoc(colName, data) {
    const docId = data.id || crypto.randomUUID();
    const payload = { ...data, id: docId, updatedAt: new Date().toISOString() };

    if (isAvailable() && db) {
        try {
            const actualCol = getEnvCol ? getEnvCol(colName) : colName;
            await db.collection(actualCol).doc(docId).set(payload, { merge: true });
            return payload;
        } catch (e) {
            console.warn(`[DecisionEngine] Firestore insert failed for ${colName}:`, e.message);
        }
    }
    return localStore.insert(colName, payload);
}

const attendanceDecisionEngine = {
    /**
     * Get active fleet and staff roster for the terminal (used for local identification and face matching)
     */
    async getTerminalRoster(orgId = 'main') {
        const [profiles, vouchers, lrs, vehicles] = await Promise.all([
            getDocs(PROFILES_COL),
            getDocs(VOUCHERS_COL),
            getDocs(LRS_COL),
            getDocs('vehicles')
        ]);

        const today = todayStr();

        // Separate drivers and staff
        const driverList = [];
        const staffList = [];

        profiles.filter(isBiometricPerson).forEach(p => {
            const type = String(p.type || p.profileType || '').toLowerCase();
            const primaryPhoto = p.facePhoto || p.photo || p.photoUrl || (p.photos && p.photos.length > 0 ? p.photos[0] : null);
            const isEnrolled = Boolean(primaryPhoto || p.faceEnrolled || (p.faceEmbedding && p.faceEmbedding.length > 0));

            if (type.includes('driver')) {
                // Find driver's active trip if any
                const pName = upper(p.name);
                const pPhone = clean(p.mobile || p.phone);
                const pTruck = upper(p.vehicleNo || p.truckNo);

                // Check today's or recent uncompleted vouchers
                const matchingVouchers = vouchers.filter(v => {
                    const vDriver = upper(v.driverName);
                    const vTruck = upper(v.truckNo);
                    return (vDriver && vDriver === pName) || (vTruck && vTruck === pTruck);
                }).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));

                // Check in-transit LRs
                const matchingLrs = lrs.filter(l => {
                    const lTruck = upper(l.truckNo);
                    return (lTruck && lTruck === pTruck) && (l.status === 'In Transit' || String(l.date || '').slice(0, 10) === today);
                }).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));

                const latestVoucher = matchingVouchers[0];
                const latestLr = matchingLrs[0];

                let status = 'AVAILABLE';
                let activeTrip = null;

                if (latestVoucher && String(latestVoucher.date || '').slice(0, 10) === today) {
                    status = 'ON_TRIP';
                    activeTrip = {
                        type: 'voucher',
                        voucherNo: latestVoucher.voucherNo || latestVoucher.entryId || 'VCH-NEW',
                        lrNo: latestVoucher.lrNo || '—',
                        destination: latestVoucher.destination || '—',
                        partyName: latestVoucher.partyName || '—',
                        material: latestVoucher.materialName || latestVoucher.material || 'Cement',
                        bags: latestVoucher.bags || '—',
                        weight: latestVoucher.weight || '—',
                        date: latestVoucher.date || today,
                    };
                } else if (latestLr && (latestLr.status === 'In Transit' || String(latestLr.date || '').slice(0, 10) === today)) {
                    status = latestLr.status === 'In Transit' ? 'ON_TRIP' : 'LOADED';
                    activeTrip = {
                        type: 'lr',
                        lrNo: latestLr.lrNo || 'LR-NEW',
                        destination: latestLr.destination || '—',
                        partyName: latestLr.partyName || '—',
                        material: latestLr.material || 'Cement',
                        bags: latestLr.totalBags || '—',
                        weight: latestLr.weight || '—',
                        date: latestLr.date || today,
                    };
                }

                driverList.push({
                    id: p.id,
                    employeeId: p.employeeId || `DRV-${p.id.slice(-4).toUpperCase()}`,
                    name: p.name,
                    phone: pPhone,
                    type: 'DRIVER',
                    assignedTruck: p.vehicleNo || p.truckNo || '',
                    faceEnrolled: isEnrolled,
                    photoUrl: primaryPhoto,
                    photo: primaryPhoto,
                    photos: p.photos || (primaryPhoto ? [primaryPhoto] : []),
                    fingerprintEnrolled: Boolean(p.fingerprintEnrolled),
                    status, // AVAILABLE | ON_TRIP | LOADED
                    activeTrip
                });
            } else if (!['tyre', 'manual', 'pump', 'firm', 'expense'].includes(type)) {
                staffList.push({
                    id: p.id,
                    employeeId: p.employeeId || `EMP-${p.id.slice(-4).toUpperCase()}`,
                    name: p.name,
                    phone: clean(p.mobile || p.phone),
                    type: 'STAFF',
                    department: p.department || p.type || 'Office',
                    faceEnrolled: isEnrolled,
                    photoUrl: primaryPhoto,
                    photo: primaryPhoto,
                    photos: p.photos || (primaryPhoto ? [primaryPhoto] : []),
                    fingerprintEnrolled: Boolean(p.fingerprintEnrolled),
                    status: 'ACTIVE'
                });
            }
        });

        const vehicleList = (vehicles || []).map(v => ({
            vehicleNo: v.vehicleNo || v.truckNo,
            driverId: v.driverId || null,
            status: v.status || 'AVAILABLE',
            location: v.location || 'Yard Rewari'
        }));

        return {
            date: today,
            drivers: driverList,
            staff: staffList,
            vehicles: vehicleList
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

        // 2. Fetch full profile and latest trip state
        const roster = await this.getTerminalRoster();
        const empName = clean(body.personName || body.profileName).toLowerCase();
        const driver = roster.drivers.find(d =>
            d.id === employeeId ||
            d.employeeId === employeeId ||
            d.phone === employeeId ||
            (empName && clean(d.name).toLowerCase() === empName)
        );
        const staff = roster.staff.find(s =>
            s.id === employeeId ||
            s.employeeId === employeeId ||
            s.phone === employeeId ||
            (empName && clean(s.name).toLowerCase() === empName)
        );

        let person = driver || staff;

        // Fallback: check raw profiles collection
        if (!person) {
            const rawProfiles = await getDocs(PROFILES_COL);
            const rawMatch = rawProfiles.find(p =>
                p.id === employeeId ||
                p.employeeId === employeeId ||
                clean(p.mobile || p.phone) === clean(employeeId) ||
                (empName && clean(p.name).toLowerCase() === empName)
            );
            if (rawMatch) {
                const isDrv = String(rawMatch.type || rawMatch.profileType || '').toLowerCase().includes('driver');
                person = {
                    id: rawMatch.id,
                    employeeId: rawMatch.employeeId || rawMatch.id,
                    name: rawMatch.name,
                    phone: rawMatch.phone || rawMatch.mobile || '',
                    type: isDrv ? 'DRIVER' : 'STAFF',
                    department: rawMatch.department || rawMatch.profileType || 'Staff',
                    assignedTruck: rawMatch.vehicleNo || rawMatch.truckNo || '',
                    vehicleNo: rawMatch.vehicleNo || rawMatch.truckNo || ''
                };
            }
        }

        // Final fallback: if terminal provided personName, create a valid attendee record
        if (!person && (body.personName || body.profileName)) {
            const isDrv = String(body.employeeType || body.type || (body.vehicleNo ? 'DRIVER' : 'STAFF')).toUpperCase().includes('DRIVER');
            person = {
                id: employeeId || crypto.randomUUID(),
                employeeId: employeeId || `EMP-${Date.now().toString().slice(-4)}`,
                name: body.personName || body.profileName,
                type: isDrv ? 'DRIVER' : 'STAFF',
                department: body.department || (isDrv ? 'Fleet' : 'Staff'),
                vehicleNo: body.vehicleNo || ''
            };
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
        await insertDoc(ATTENDANCE_EVENTS_COL, eventRecord);

        // Update recent scans cache
        recentScans.set(employeeId, nowMs);

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
        await insertDoc(ATTENDANCE_COL, punchRecord);

        // 5. Update daily summary attendance record
        let summaryDoc = null;
        try {
            const summaryDocId = `${person.id}_${date}`;
            const existingDocs = await getDocs(ATTENDANCE_COL);
            const existingSummary = existingDocs.find(d => d.id === summaryDocId || d.id === `${date}_${person.id}`);

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
            await insertDoc(ATTENDANCE_COL, summaryDoc);

            // Also keep backwards compatible id `${date}_${person.id}` updated
            await insertDoc(ATTENDANCE_COL, { ...summaryDoc, id: `${date}_${person.id}` });
        } catch (attErr) {
            console.warn('[DecisionEngine] Failed to update daily attendance summary doc:', attErr.message);
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

    async enrollPerson(body = {}) {
        const docId = body.id || body.personId || body.profileId || crypto.randomUUID();
        const profiles = await getDocs(PROFILES_COL);
        const existing = profiles.find(p => p.id === docId);

        const photo = body.facePhoto || body.photo || body.photoUrl || null;
        const photos = (body.photos && Array.isArray(body.photos) && body.photos.length > 0)
            ? body.photos
            : (photo ? [photo] : (existing?.photos || []));
        const faceEmbedding = body.faceEmbedding || body.embedding || existing?.faceEmbedding || null;
        const fingerprintEnrolled = body.fingerprintEnrolled !== undefined
            ? Boolean(body.fingerprintEnrolled)
            : Boolean(existing?.fingerprintEnrolled);
        const fingerprintSlotId = body.fingerprintSlotId !== undefined
            ? body.fingerprintSlotId
            : (existing?.fingerprintSlotId || null);

        const assignedTruck = body.assignedTruck !== undefined ? body.assignedTruck : (body.vehicleNo !== undefined ? body.vehicleNo : (existing?.vehicleNo || existing?.truckNo || ''));

        const payload = {
            ...(existing || {}),
            id: docId,
            name: body.name || existing?.name || 'Unnamed',
            phone: body.phone || existing?.phone || existing?.mobile || '',
            mobile: body.phone || existing?.mobile || '',
            employeeId: body.employeeId || existing?.employeeId || `${(body.type || existing?.type) === 'DRIVER' ? 'DRV' : 'EMP'}-${docId.slice(-4).toUpperCase()}`,
            type: String(body.type || existing?.type || 'DRIVER').toLowerCase(),
            profileType: body.profileType || existing?.profileType || (body.type?.toLowerCase() === 'driver' ? 'Driver' : 'Staff'),
            vehicleNo: assignedTruck,
            truckNo: assignedTruck,
            photo: photo || existing?.photo || (photos.length > 0 ? photos[0] : null),
            photos: photos,
            facePhoto: photo || existing?.facePhoto || (photos.length > 0 ? photos[0] : null),
            photoUrl: photo || existing?.photoUrl || (photos.length > 0 ? photos[0] : null),
            faceEmbedding: faceEmbedding,
            faceEnrolled: Boolean(photo || existing?.faceEnrolled || (photos && photos.length > 0)),
            fingerprintEnrolled: fingerprintEnrolled,
            fingerprintSlotId: fingerprintSlotId,
            updatedAt: new Date().toISOString()
        };

        await insertDoc(PROFILES_COL, payload);
        return payload;
    },

    async deleteEnrollment(id) {
        const profiles = await getDocs(PROFILES_COL);
        const existing = profiles.find(p => p.id === id);
        if (!existing) return { success: false, message: 'Person not found' };

        const payload = {
            ...existing,
            facePhoto: null,
            photo: null,
            photoUrl: null,
            photos: [],
            faceEnrolled: false,
            fingerprintEnrolled: false,
            updatedAt: new Date().toISOString()
        };
        await insertDoc(PROFILES_COL, payload);
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
