/**
 * vehicleEmiService.js
 *
 * Automatically tracks Own Fleet vehicle loan EMIs:
 * - Scans vehicles with active loan EMIs.
 * - Reconciles and automatically marks elapsed installments (dueDate <= today) as PAID
 *   on their due date (Bank Auto-Debit). No manual verification required.
 */

const { db, admin, isAvailable } = require('../firebase');
const localStore = require('../utils/localStore');

const COLLECTION_VEHICLES = 'vehicles';

function getTodayString() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

/**
 * Reconciles and auto-marks all past/due EMI installments as PAID.
 * Returns { updatedDetails, hadChanges, nextUpcoming }
 */
function syncVehicleEmiSchedule(emiDetails, todayStr) {
    if (!emiDetails || typeof emiDetails !== 'object') {
        return { updatedDetails: emiDetails, hadChanges: false, nextUpcoming: null };
    }

    let hadChanges = false;
    const updated = { ...emiDetails };
    const schedule = Array.isArray(updated.schedule) ? [...updated.schedule] : [];
    const paidSet = new Set(Array.isArray(updated.paidEmis) ? updated.paidEmis : []);

    let nextUpcoming = null;

    if (schedule.length > 0) {
        const newSchedule = schedule.map(item => {
            const itemDueDate = item.dueDate ? item.dueDate.slice(0, 10) : '';
            if (!itemDueDate) return item;

            // Past or today's installment: automatically marked as PAID
            if (itemDueDate <= todayStr) {
                const monthStr = itemDueDate.slice(0, 7);
                if (!paidSet.has(monthStr)) {
                    paidSet.add(monthStr);
                    hadChanges = true;
                }
                if (item.status !== 'paid') {
                    hadChanges = true;
                    return {
                        ...item,
                        status: 'paid',
                        paymentDate: item.paymentDate || itemDueDate,
                        paymentMethod: item.paymentMethod || 'Bank Auto-Debit',
                        remarks: item.remarks || 'Auto-deducted on due date'
                    };
                }
            } else {
                // Future installment
                if (!nextUpcoming || itemDueDate < nextUpcoming.dueDate) {
                    nextUpcoming = item;
                }
            }
            return item;
        });

        updated.schedule = newSchedule;
        updated.paidEmis = Array.from(paidSet).sort();
    } else {
        // Simple tracking without full schedule
        const due = parseFloat(updated.due) || 0;
        const emiDay = parseInt(updated.emiDay, 10) || 5;
        const startDate = updated.startDate ? updated.startDate.slice(0, 10) : null;
        const tenure = parseInt(updated.tenure, 10) || 0;

        if (startDate && due > 0) {
            const start = new Date(startDate);
            const today = new Date(todayStr);

            let monthsElapsed = (today.getFullYear() - start.getFullYear()) * 12 + (today.getMonth() - start.getMonth());
            if (today.getDate() < emiDay) monthsElapsed--;
            if (tenure > 0) monthsElapsed = Math.min(monthsElapsed, tenure);

            for (let i = 1; i <= monthsElapsed; i++) {
                const d = new Date(start.getFullYear(), start.getMonth() + i, emiDay);
                const monthStr = d.toISOString().slice(0, 7);
                if (!paidSet.has(monthStr)) {
                    paidSet.add(monthStr);
                    hadChanges = true;
                }
            }
            updated.paidEmis = Array.from(paidSet).sort();

            const nextMonthIndex = monthsElapsed + 1;
            if (tenure === 0 || nextMonthIndex <= tenure) {
                const nextD = new Date(start.getFullYear(), start.getMonth() + nextMonthIndex, emiDay);
                nextUpcoming = {
                    installmentNo: nextMonthIndex,
                    dueDate: nextD.toISOString().slice(0, 10),
                    amount: due
                };
            }
        }
    }

    return { updatedDetails: updated, hadChanges, nextUpcoming };
}

/**
 * Scans all Own Fleet vehicles and automatically updates past due EMIs as paid in the database.
 */
async function autoSyncAllVehicleEmis(options = {}) {
    const { orgId = 'vgtc', req = null } = options;
    const todayStr = getTodayString();

    let vehicles = [];
    const colName = req?.orgId ? `${req.orgId}_${COLLECTION_VEHICLES}` : COLLECTION_VEHICLES;

    if (!isAvailable()) {
        vehicles = localStore.getAll(COLLECTION_VEHICLES).filter(v => (v.orgId || 'vgtc') === orgId);
    } else {
        const snap = await db.collection(colName).where('orgId', '==', orgId).get();
        vehicles = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }

    const ownFleet = vehicles.filter(v => v.ownershipType === 'self' || v.isSelf === true);
    let autoPaidCount = 0;

    for (const v of ownFleet) {
        if (!v.emiDetails) continue;
        let emi = null;
        try {
            emi = typeof v.emiDetails === 'string' ? JSON.parse(v.emiDetails) : v.emiDetails;
        } catch (_) {
            continue;
        }

        const dueAmount = parseFloat(emi.due) || 0;
        if (dueAmount <= 0 && !emi.loanNo) continue;

        const { updatedDetails, hadChanges } = syncVehicleEmiSchedule(emi, todayStr);

        if (hadChanges) {
            autoPaidCount++;
            const serialized = JSON.stringify(updatedDetails);
            if (!isAvailable()) {
                localStore.update(COLLECTION_VEHICLES, v.id, { emiDetails: serialized });
            } else {
                await db.collection(colName).doc(v.id).update({
                    emiDetails: serialized,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                }).catch(err => console.error(`[EmiSync] Failed to save auto-paid EMI for ${v.truckNo}:`, err.message));
            }
        }
    }

    return {
        success: true,
        today: todayStr,
        autoPaidCount
    };
}

module.exports = {
    syncVehicleEmiSchedule,
    autoSyncAllVehicleEmis,
    getTodayString
};
