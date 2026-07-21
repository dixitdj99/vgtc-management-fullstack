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
    const { truckNo, type, amount, date, remark, addToCashbook, cashbookEntryId } = data;
    if (!truckNo) throw new Error('Truck number required');
    if (!type || !['credit', 'debit'].includes(type)) throw new Error('Type must be credit or debit');
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) throw new Error('Amount must be positive');

    let linkedCashbookId = cashbookEntryId || null;

    // Optional Cashbook integration
    if (addToCashbook && !linkedCashbookId) {
        try {
            const cbType = type === 'credit' ? 'deposit' : 'cash_out';
            const cbRemark = `[Vehicle ${truckNo}] ${type === 'credit' ? 'Credit Advance Received' : 'Debit Advance Given'} — ${remark || ''}`;
            const cbDoc = await cashbookService.addEntry(orgId, cbType, amt, cbRemark, date || new Date().toISOString().slice(0, 10), cashbookCol, {
                entityType: 'vehicle',
                entityId: truckNo,
            });
            linkedCashbookId = cbDoc.id;
        } catch (cbErr) {
            console.error('[VehicleAdvance] Cashbook auto-create error:', cbErr.message);
        }
    }

    const payload = {
        truckNo: String(truckNo).toUpperCase().replace(/\s/g, ''),
        type,
        orgId,
        amount: amt,
        date: date || new Date().toISOString().slice(0, 10),
        remark: remark || '',
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

module.exports = {
    createAdvance,
    getAllAdvances,
    getAdvancesByTruck,
    deleteAdvance,
    clearAdvancesForTruck
};
