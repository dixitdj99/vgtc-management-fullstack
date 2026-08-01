const localStore = require('../utils/localStore');
const { normalizePartyName } = require('../utils/partyNameUtils');
const { db, admin, isAvailable } = require('../firebase');
const firebaseAvailable = () => isAvailable();

const COLLECTION_VOUCHERS = 'vouchers';

// ── Public API ────────────────────────────────────────────────────────────────

const createVoucher = async (orgId, data, col = COLLECTION_VOUCHERS) => {
    const { type, ...voucherData } = data;
    const finalData = {
        ...voucherData,
        type,
        orgId,
        partyName: normalizePartyName(voucherData.partyName || '')
    };

    if (firebaseAvailable()) {
        const ref = db.collection(col).doc();
        await ref.set({ ...finalData, createdAt: admin.firestore.FieldValue.serverTimestamp() });
        return { id: ref.id, ...finalData };
    }
    return localStore.insert(COLLECTION_VOUCHERS, finalData);
};

const getVouchersByType = async (orgId, type, col = COLLECTION_VOUCHERS) => {
    if (firebaseAvailable()) {
        const snapshot = await db.collection(col)
            .where('orgId', '==', orgId)
            .get();
        const docs = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(d => d.type === type);
        return docs.sort((a, b) => {
            const aTime = a.createdAt && a.createdAt.seconds ? a.createdAt.seconds : 0;
            const bTime = b.createdAt && b.createdAt.seconds ? b.createdAt.seconds : 0;
            return bTime - aTime;
        });
    }
    return localStore.getAll(COLLECTION_VOUCHERS)
        .filter(v => v.orgId === orgId && v.type === type)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
};

const getAllVouchers = async (orgId, col = COLLECTION_VOUCHERS) => {
    if (firebaseAvailable()) {
        const snapshot = await db.collection(col).where('orgId', '==', orgId).get();
        const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        return docs.sort((a, b) => {
            const aTime = a.createdAt && a.createdAt.seconds ? a.createdAt.seconds : 0;
            const bTime = b.createdAt && b.createdAt.seconds ? b.createdAt.seconds : 0;
            return bTime - aTime;
        });
    }
    return localStore.getAll(COLLECTION_VOUCHERS)
        .filter(v => v.orgId === orgId)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
};

const getVouchersByTruckAndDate = async (orgId, truckNo, paymentClearedDate, col = COLLECTION_VOUCHERS) => {
    if (firebaseAvailable()) {
        const snapshot = await db.collection(col)
            .where('orgId', '==', orgId)
            .get();
        const docs = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(d => d.truckNo === truckNo && d.paymentClearedDate === paymentClearedDate);
        return docs.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
    }
    return localStore.getAll(COLLECTION_VOUCHERS)
        .filter(v => v.orgId === orgId && v.truckNo === truckNo && v.paymentClearedDate === paymentClearedDate)
        .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
};

const updateVoucher = async (id, data, col = COLLECTION_VOUCHERS) => {
    const payload = {
        ...data,
        ...(data.partyName !== undefined ? { partyName: normalizePartyName(data.partyName || '') } : {})
    };

    /**
     * `isOnlinePaid` is a bare flag with no record of what was paid, so it only
     * means anything while the amount stays put. Raise an already-paid online
     * advance from 3,000 to 8,000 and the flag survives: the extra 5,000 is owed
     * to the driver but Pay → Online reports everything settled, and nobody sees
     * it again.
     *
     * So a changed amount retires the mark. Not when the caller sets the flag in
     * the same patch — that is someone recording payment of the new amount, and
     * their explicit intent wins.
     */
    if (payload.advanceOnline !== undefined && payload.isOnlinePaid === undefined) {
        const current = await getVoucherById(id, col);
        const before = parseFloat(current?.advanceOnline) || 0;
        const after = parseFloat(payload.advanceOnline) || 0;
        if (current?.isOnlinePaid && before !== after) {
            payload.isOnlinePaid = false;
            payload.onlinePaidDate = null;
            console.log(`[Voucher] Online advance on ${id} changed ${before} -> ${after}; clearing the paid mark so it returns to the pay list.`);
        }
    }

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
    getAllVouchers,
};
