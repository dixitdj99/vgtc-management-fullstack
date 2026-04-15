const localStore = require('../utils/localStore');
const { normalizePartyName } = require('../utils/partyNameUtils');
const { db, admin, isAvailable } = require('../firebase');
const firebaseAvailable = () => isAvailable();

const COLLECTION_VOUCHERS = 'vouchers';

// ── Public API ────────────────────────────────────────────────────────────────

const createVoucher = async (data, col = COLLECTION_VOUCHERS) => {
    const { type, ...voucherData } = data;
    const finalData = {
        ...voucherData,
        type,
        partyName: normalizePartyName(voucherData.partyName || '')
    };

    if (firebaseAvailable()) {
        const ref = db.collection(col).doc();
        await ref.set({ ...finalData, createdAt: admin.firestore.FieldValue.serverTimestamp() });
        return { id: ref.id, ...finalData };
    }
    return localStore.insert(COLLECTION_VOUCHERS, finalData);
};

const getVouchersByType = async (type, col = COLLECTION_VOUCHERS) => {
    if (firebaseAvailable()) {
        // Use only a single-field where — no orderBy — to avoid requiring a composite index.
        // Sort by createdAt in JS after fetching.
        const snapshot = await db.collection(col)
            .where('type', '==', type)
            .get();
        const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        return docs.sort((a, b) => {
            const aTime = a.createdAt && a.createdAt.seconds ? a.createdAt.seconds : 0;
            const bTime = b.createdAt && b.createdAt.seconds ? b.createdAt.seconds : 0;
            return bTime - aTime;
        });
    }
    return localStore.getAll(COLLECTION_VOUCHERS)
        .filter(v => v.type === type)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
};

const getVouchersByTruckAndDate = async (truckNo, paymentClearedDate, col = COLLECTION_VOUCHERS) => {
    if (firebaseAvailable()) {
        const snapshot = await db.collection(col)
            .where('truckNo', '==', truckNo)
            .where('paymentClearedDate', '==', paymentClearedDate)
            .get();
        const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        return docs.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
    }
    return localStore.getAll(COLLECTION_VOUCHERS)
        .filter(v => v.truckNo === truckNo && v.paymentClearedDate === paymentClearedDate)
        .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
};

const updateVoucher = async (id, data, col = COLLECTION_VOUCHERS) => {
    const payload = {
        ...data,
        ...(data.partyName !== undefined ? { partyName: normalizePartyName(data.partyName || '') } : {})
    };

    if (firebaseAvailable()) {
        await db.collection(col).doc(id).update({
            ...payload,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
    } else {
        localStore.update(COLLECTION_VOUCHERS, id, payload);
    }
};

const deleteVoucher = async (id, col = COLLECTION_VOUCHERS) => {
    if (firebaseAvailable()) {
        await db.collection(col).doc(id).delete();
    } else {
        localStore.delete(COLLECTION_VOUCHERS, id);
    }
};

const getVoucherById = async (id, col = COLLECTION_VOUCHERS) => {
    if (firebaseAvailable()) {
        const doc = await db.collection(col).doc(id).get();
        if (doc.exists) return { id: doc.id, ...doc.data() };
        return null;
    }
    const all = localStore.getAll(COLLECTION_VOUCHERS);
    return all.find(v => v.id === id) || null;
};

module.exports = {
    createVoucher,
    getVouchersByType,
    getVouchersByTruckAndDate,
    updateVoucher,
    deleteVoucher,
    getVoucherById,
};
