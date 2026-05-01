const localStore = require('../utils/localStore');
const { db, admin, isAvailable } = require('../firebase');
const firebaseAvailable = () => isAvailable();

const COLLECTION = 'vehicle_advances';

// ── Firestore helpers ──────────────────────────────────────────────────────────

const firestoreCreate = async (data, col) => {
    const ref = db.collection(col).doc();
    const payload = {
        ...data,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
    };
    await ref.set(payload);
    return { id: ref.id, ...data };
};

const firestoreGetAll = async (col) => {
    const snapshot = await db.collection(col).orderBy('createdAt', 'desc').get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

const firestoreGetByTruck = async (truckNo, col) => {
    const snapshot = await db.collection(col)
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

const createAdvance = async (data, col = COLLECTION) => {
    const { truckNo, type, amount, date, remark } = data;
    if (!truckNo) throw new Error('Truck number required');
    if (!type || !['credit', 'debit'].includes(type)) throw new Error('Type must be credit or debit');
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) throw new Error('Amount must be positive');

    const payload = {
        truckNo: String(truckNo).toUpperCase().replace(/\s/g, ''),
        type,
        amount: amt,
        date: date || new Date().toISOString().slice(0, 10),
        remark: remark || ''
    };

    if (firebaseAvailable()) return await firestoreCreate(payload, col);
    return localStore.insert(col, payload);
};

const getAllAdvances = async (col = COLLECTION) => {
    if (firebaseAvailable()) return await firestoreGetAll(col);
    return localStore.getAll(col).sort((a, b) => new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date));
};

const getAdvancesByTruck = async (truckNo, col = COLLECTION) => {
    const normalizedTruck = String(truckNo).toUpperCase().replace(/\s/g, '');
    if (firebaseAvailable()) return await firestoreGetByTruck(normalizedTruck, col);
    return localStore.getAll(col)
        .filter(a => a.truckNo === normalizedTruck)
        .sort((a, b) => new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date));
};

const deleteAdvance = async (id, col = COLLECTION) => {
    if (firebaseAvailable()) {
        await firestoreDelete(id, col);
        return;
    }
    localStore.delete(col, id);
};

module.exports = {
    createAdvance,
    getAllAdvances,
    getAdvancesByTruck,
    deleteAdvance
};
