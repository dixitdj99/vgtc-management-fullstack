/**
 * attendanceDecisionEngine.js — Intelligent VGTC Terminal Biometric Decision Engine
 *
 * Implements the core logic defined in "VGTC OS — Terminal Specification":
 * 1. Face / Biometric Recognition event processing.
 * 2. 60-second duplicate scan protection.
 * 3. Driver trip state resolution (AVAILABLE -> ON_TRIP -> TRIP_RETURN).
 * 4. Staff office check-in / check-out calculation.
 * 5. Event logging and automatic sync into VGTC daily attendance records.
 */

const { db, isAvailable } = require('../firebase');
const localStore = require('../utils/localStore');
const { getCol } = require('../utils/collectionUtils');
const crypto = require('crypto');

const ATTENDANCE_EVENTS_COL = 'attendance_events';
const ATTENDANCE_COL = 'attendance';
const PROFILES_COL = 'profiles';
const VOUCHERS_COL = 'vouchers';
const LRS_COL = 'lrs';
const TERMINALS_COL = 'terminals';

// In-memory duplicate scan cache: employeeId -> timestamp (ms)
const recentScans = new Map();
const DUPLICATE_WINDOW_MS = 60 * 1000; // 60 seconds duplicate protection

const clean = s => String(s || '').trim();
const upper = s => clean(s).toUpperCase().replace(/\s+/g, '');
const todayStr = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

async function getDocs(colName) {
    if (isAvailable() && db) {
        try {
            const snap = await db.collection(colName).get();
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
            await db.collection(colName).doc(docId).set(payload, { merge: true });
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

        profiles.forEach(p => {
            const type = String(p.type || '').toLowerCase();
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
                    faceEnrolled: Boolean(p.facePhoto || p.photoUrl || p.faceEnrolled),
                    photoUrl: p.facePhoto || p.photoUrl || null,
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
                    faceEnrolled: Boolean(p.facePhoto || p.photoUrl || p.faceEnrolled),
                    photoUrl: p.facePhoto || p.photoUrl || null,
                    fingerprintEnrolled: Boolean(p.fingerprintEnrolled),
                    status: 'ACTIVE'
                });
            }
        });

        const vehicleList = (vehicles || []).map(v => ({
            id: v.id,
            truckNo: v.truckNo,
            owner: v.ownerName || v.owner || '',
            driverName: v.driverName || '',
            status: v.status || 'AVAILABLE'
        })).filter(v => Boolean(v.truckNo));

        return {
            today,
            totalDrivers: driverList.length,
            totalStaff: staffList.length,
            drivers: driverList,
            staff: staffList,
            vehicles: vehicleList,
            terminals: [
                { id: 'OFFICE-REWARI-01', name: 'Main Yard Terminal — Gate 1', location: 'Jharli / Rewari' }
            ]
        };
    },

    /**
     * Process an incoming attendance scan or terminal action
     */
    async processEvent({
        eventId,
        employeeId,
        employeeType, // 'DRIVER' | 'STAFF'
        terminalId = 'OFFICE-REWARI-01',
        biometricMethod = 'FACE', // 'FACE' | 'MANUAL_ID' | 'FINGERPRINT'
        action = 'AUTO', // 'AUTO' | 'CHECK_IN' | 'CHECK_OUT' | 'TRIP_RETURN' | 'OFFICE_VISIT'
        timestamp,
        notes = '',
        isTest = false
    }) {
        const now = timestamp ? new Date(timestamp) : new Date();
        const nowMs = now.getTime();
        const date = todayStr();
        const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

        // 1. Duplicate check (60-second cooldown per employee, skipped in testing mode or explicit scan)
        const lastScanTime = recentScans.get(employeeId);
        if (!isTest && lastScanTime && (nowMs - lastScanTime < DUPLICATE_WINDOW_MS) && action === 'AUTO') {
            const elapsedSec = Math.round((nowMs - lastScanTime) / 1000);
            return {
                status: 'DUPLICATE',
                message: `Attendance already recorded ${elapsedSec}s ago. Cooldown active.`,
                employeeId,
                terminalId,
                duplicateCooldownSec: Math.max(0, 60 - elapsedSec)
            };
        }

        // 2. Fetch full profile and latest trip state
        const roster = await this.getTerminalRoster();
        const driver = roster.drivers.find(d => d.id === employeeId || d.employeeId === employeeId || d.phone === employeeId);
        const staff = roster.staff.find(s => s.id === employeeId || s.employeeId === employeeId || s.phone === employeeId);

        const person = driver || staff;
        if (!person) {
            return {
                status: 'UNKNOWN_EMPLOYEE',
                message: `No active employee or driver found for ID/Phone "${employeeId}"`,
                employeeId
            };
        }

        const isDriver = !!driver;
        let eventType = action;

        // Auto-resolve action if 'AUTO'
        if (action === 'AUTO') {
            if (isDriver) {
                if (driver.status === 'ON_TRIP' || driver.status === 'LOADED') {
                    eventType = 'PROMPT_TRIP_RETURN'; // Terminal will display prompt options
                } else {
                    eventType = 'CHECK_IN';
                }
            } else {
                eventType = 'CHECK_IN';
            }
        }

        // If the driver is returning from a trip
        let tripDetails = driver?.activeTrip || null;

        // Create immutable attendance event record
        const record = {
            id: eventId || crypto.randomUUID(),
            employeeId: person.id,
            employeeCode: person.employeeId,
            employeeName: person.name,
            employeeType: isDriver ? 'DRIVER' : 'STAFF',
            terminalId,
            eventType,
            biometricMethod,
            timestamp: now.toISOString(),
            date,
            time: timeStr,
            tripDetails,
            notes,
            syncStatus: 'SYNCED',
            createdAt: now.toISOString()
        };

        // Write event log
        await insertDoc(ATTENDANCE_EVENTS_COL, record);

        // Update recent scans cache
        recentScans.set(employeeId, nowMs);

        // Update daily attendance collection so the existing VGTC dashboard reflects it immediately
        try {
            const attendanceDocId = `${date}_${person.id}`;
            await insertDoc(ATTENDANCE_COL, {
                id: attendanceDocId,
                date,
                profileId: person.id,
                profileName: person.name,
                profileType: isDriver ? 'Driver' : (person.department || 'Staff'),
                status: 'present',
                source: 'terminal',
                terminalId,
                terminalEvent: eventType,
                terminalTime: timeStr,
                updatedAt: now.toISOString()
            });
        } catch (attErr) {
            console.warn('[DecisionEngine] Failed to update daily attendance doc:', attErr.message);
        }

        return {
            status: 'SUCCESS',
            eventType,
            message: eventType === 'TRIP_RETURN'
                ? `Welcome back, ${person.name}! Trip return recorded.`
                : eventType === 'CHECK_IN'
                ? `Check-in confirmed for ${person.name} at ${timeStr}`
                : `Gate visit recorded for ${person.name}`,
            person,
            tripDetails,
            time: timeStr,
            date,
            terminalId
        };
    },

    async enrollPerson({ id, name, phone, employeeId, type = 'DRIVER', assignedTruck, facePhoto, fingerprintEnrolled }) {
        const docId = id || crypto.randomUUID();
        const profiles = await getDocs(PROFILES_COL);
        const existing = profiles.find(p => p.id === docId);

        const payload = {
            ...(existing || {}),
            id: docId,
            name: name || existing?.name || 'Unnamed',
            phone: phone || existing?.phone || existing?.mobile || '',
            mobile: phone || existing?.mobile || '',
            employeeId: employeeId || existing?.employeeId || `${type === 'DRIVER' ? 'DRV' : 'EMP'}-${docId.slice(-4).toUpperCase()}`,
            type: String(type).toLowerCase(),
            vehicleNo: assignedTruck !== undefined ? assignedTruck : (existing?.vehicleNo || existing?.truckNo || ''),
            truckNo: assignedTruck !== undefined ? assignedTruck : (existing?.truckNo || existing?.vehicleNo || ''),
            facePhoto: facePhoto !== undefined ? facePhoto : (existing?.facePhoto || null),
            faceEnrolled: facePhoto ? true : (existing?.faceEnrolled || false),
            fingerprintEnrolled: fingerprintEnrolled !== undefined ? fingerprintEnrolled : (existing?.fingerprintEnrolled || false),
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
