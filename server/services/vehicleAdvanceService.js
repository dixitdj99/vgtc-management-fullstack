const localStore = require('../utils/localStore');
const { db, admin, isAvailable } = require('../firebase');
const cashbookService = require('../utils/cashbookService');
const { getCol } = require('../utils/collectionUtils');
const firebaseAvailable = () => isAvailable();

const COLLECTION = 'vehicle_advances';
const CASHBOOK_COL = 'cashbook';

// ── Firestore helpers ──────────────────────────────────────────────────────────

const firestoreCreate = async (orgId, data, col) => {
    const ref = db.collection(col).doc();
    const payload = {
        ...data,
        orgId,
        isCleared: data.isCleared !== undefined ? data.isCleared : false,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
    };
    await ref.set(payload);
    return { id: ref.id, ...data, isCleared: payload.isCleared };
};

const firestoreGetAll = async (orgId, col) => {
    const snapshot = await db.collection(col)
        .where('orgId', '==', orgId)
        .get();
    const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    return docs.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
};

const firestoreGetByTruck = async (orgId, truckNo, col) => {
    const snapshot = await db.collection(col)
        .where('orgId', '==', orgId)
        .where('truckNo', '==', truckNo)
        .get();
        
    const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    return docs.sort((a, b) => {
        const da = a.createdAt && a.createdAt.toMillis ? a.createdAt.toMillis() : new Date(a.date).getTime();
        const db_time = b.createdAt && b.createdAt.toMillis ? b.createdAt.toMillis() : new Date(b.date).getTime();
        return db_time - da;
    });
};

const firestoreDelete = async (id, col) => {
    await db.collection(col).doc(id).delete();
};

// ── Public API ─────────────────────────────────────────────────────────────────

const createAdvance = async (orgId, data, col = COLLECTION, cashbookCol = CASHBOOK_COL) => {
    const { truckNo, type, amount, date, remark, ownerName, cashbookEntryId } = data;
    if (!truckNo) throw new Error('Truck number required');
    if (!type || !['credit', 'debit'].includes(type)) throw new Error('Type must be credit or debit');
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) throw new Error('Amount must be positive');

    const normalizedTruck = String(truckNo).toUpperCase().replace(/\s/g, '');
    let linkedCashbookId = cashbookEntryId || null;

    // ── Auto Cashbook integration ─────────────────────────────────────────────
    // Credit  (owner deposits cash)   → always create a cashbook DEPOSIT
    // Debit   (advance given to truck) → always create a cashbook CASH OUT
    // The cashbook entry carries full details so the cash flow is auditable.
    if (!linkedCashbookId) {
        try {
            const cbType = type === 'credit' ? 'deposit' : 'cash_out';
            const ownerTag = ownerName ? ` — ${ownerName}` : '';
            const purposeTag = remark ? ` — ${remark}` : '';
            const cbRemark = type === 'credit'
                ? `[Vehicle Deposit] ${normalizedTruck}${ownerTag}${purposeTag}`
                : `[Vehicle Advance Given] ${normalizedTruck}${ownerTag}${purposeTag}`;
            const cbDoc = await cashbookService.addEntry(
                orgId, cbType, amt, cbRemark,
                date || new Date().toISOString().slice(0, 10),
                cashbookCol,
                { entityType: 'vehicle', entityId: normalizedTruck, ownerName: ownerName || '' }
            );
            linkedCashbookId = cbDoc.id;
            console.log(`[VehicleAdvance] Cashbook ${cbType} created: ${cbDoc.id} for ${normalizedTruck}`);
        } catch (cbErr) {
            console.error('[VehicleAdvance] Cashbook auto-create error:', cbErr.message);
        }
    }

    const payload = {
        truckNo: normalizedTruck,
        type,
        orgId,
        amount: amt,
        date: date || new Date().toISOString().slice(0, 10),
        remark: remark || '',
        ownerName: ownerName || '',
        isCleared: data.isCleared !== undefined ? data.isCleared : false,
        isGpsRent: data.isGpsRent || false,
        ...(linkedCashbookId ? { cashbookEntryId: linkedCashbookId } : {}),
    };

    if (firebaseAvailable()) return await firestoreCreate(orgId, payload, col);
    return localStore.insert(col, payload);
};

const getAllAdvances = async (orgId, col = COLLECTION) => {
    if (firebaseAvailable()) return await firestoreGetAll(orgId, col);
    return localStore.getAll(col)
        .filter(a => a.orgId === orgId)
        .sort((a, b) => new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date));
};

const getAdvancesByTruck = async (orgId, truckNo, col = COLLECTION) => {
    const normalizedTruck = String(truckNo).toUpperCase().replace(/\s/g, '');
    if (firebaseAvailable()) return await firestoreGetByTruck(orgId, normalizedTruck, col);
    return localStore.getAll(col)
        .filter(a => a.orgId === orgId && a.truckNo === normalizedTruck)
        .sort((a, b) => new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date));
};

const deleteAdvance = async (id, col = COLLECTION) => {
    if (firebaseAvailable()) {
        await firestoreDelete(id, col);
        return;
    }
    localStore.delete(col, id);
};

const clearAdvancesForTruck = async (orgId, truckNo, paymentId, advanceIds = [], col = COLLECTION) => {
    const normalizedTruck = String(truckNo).toUpperCase().replace(/\s/g, '');
    if (firebaseAvailable()) {
        const snapshot = await db.collection(col)
            .where('orgId', '==', orgId)
            .where('truckNo', '==', normalizedTruck)
            .where('isCleared', '==', false)
            .get();

        const batch = db.batch();
        snapshot.docs.forEach(doc => {
            if (advanceIds.length === 0 || advanceIds.includes(doc.id)) {
                batch.update(doc.ref, {
                    isCleared: true,
                    clearedInPaymentId: paymentId || `PAY-${Date.now()}`,
                    clearedAt: admin.firestore.FieldValue.serverTimestamp()
                });
            }
        });
        await batch.commit();
        return { success: true, count: snapshot.docs.length };
    } else {
        const advances = localStore.getAll(col);
        advances.forEach(a => {
            if (a.orgId === orgId && a.truckNo === normalizedTruck && !a.isCleared) {
                if (advanceIds.length === 0 || advanceIds.includes(a.id)) {
                    a.isCleared = true;
                    a.clearedInPaymentId = paymentId || `PAY-${Date.now()}`;
                    a.clearedAt = new Date().toISOString();
                }
            }
        });
        localStore.saveAll(col, advances);
        return { success: true };
    }
};

/**
 * returnCreditToOwner
 *
 * Atomically:
 *   1. Validates the advance is a credit type and not already cleared/returned.
 *   2. Creates a cashbook cash_out entry (owner gets their money back).
 *   3. Marks the advance as isCleared=true and stores the return cashbook ID.
 *
 * @param {string} orgId
 * @param {string} advanceId   - The vehicle_advance document ID to return
 * @param {string} col         - vehicle_advances collection
 * @param {string} cashbookCol - cashbook collection
 * @param {object} options     - { date, remark }
 */
const returnCreditToOwner = async (orgId, advanceId, col = COLLECTION, cashbookCol = CASHBOOK_COL, options = {}) => {
    // 1. Fetch the advance
    let advance = null;
    if (firebaseAvailable()) {
        const doc = await db.collection(col).doc(advanceId).get();
        if (!doc.exists) throw new Error('Advance record not found.');
        advance = { id: doc.id, ...doc.data() };
    } else {
        advance = localStore.getAll(col).find(a => a.id === advanceId);
        if (!advance) throw new Error('Advance record not found.');
    }

    if (advance.type !== 'credit') throw new Error('Only credit entries can be returned to owner.');
    if (advance.isCleared) throw new Error('This credit entry is already cleared/returned.');
    if (advance.returnedAt) throw new Error('This credit has already been returned.');

    const returnDate = options.date || new Date().toISOString().slice(0, 10);
    const ownerTag = advance.ownerName ? ` — ${advance.ownerName}` : '';
    const purposeTag = options.remark || advance.remark ? ` — ${options.remark || advance.remark}` : '';
    const cbRemark = `[Vehicle Credit Return] ${advance.truckNo}${ownerTag}${purposeTag}`;

    // 2. Create cashbook cash_out for the return
    let returnCashbookId = null;
    try {
        const cbDoc = await cashbookService.addEntry(
            orgId, 'cash_out', advance.amount, cbRemark,
            returnDate, cashbookCol,
            {
                entityType: 'vehicle',
                entityId: advance.truckNo,
                ownerName: advance.ownerName || '',
                linkedAdvanceId: advanceId,
                isReturnEntry: true
            }
        );
        returnCashbookId = cbDoc.id;
        console.log(`[VehicleAdvance] Return cash_out created: ${cbDoc.id} for ${advance.truckNo}`);
    } catch (cbErr) {
        console.error('[VehicleAdvance] Return cashbook entry failed:', cbErr.message);
        throw new Error('Failed to create cashbook return entry: ' + cbErr.message);
    }

    // 3. Mark the advance as cleared + link the return cashbook entry
    const updatePayload = {
        isCleared: true,
        returnedAt: new Date().toISOString(),
        returnCashbookEntryId: returnCashbookId,
        returnRemark: options.remark || '',
    };

    if (firebaseAvailable()) {
        await db.collection(col).doc(advanceId).update({
            ...updatePayload,
            clearedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
    } else {
        localStore.update(col, advanceId, updatePayload);
    }

    return {
        success: true,
        advanceId,
        truckNo: advance.truckNo,
        amount: advance.amount,
        returnCashbookEntryId: returnCashbookId,
        returnedAt: updatePayload.returnedAt,
    };
};

module.exports = {
    createAdvance,
    getAllAdvances,
    getAdvancesByTruck,
    deleteAdvance,
    clearAdvancesForTruck,
    returnCreditToOwner
};
