const localStore = require('./localStore');
const { db, admin, isAvailable } = require('../firebase');

const firebaseAvailable = () => isAvailable();
const DEFAULT_COLLECTION = 'sales';

const getAll = async (collection = DEFAULT_COLLECTION) => {
    if (firebaseAvailable()) {
        const snapshot = await db.collection(collection).orderBy('date', 'desc').get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }
    return localStore.getAll(collection).sort((a, b) => new Date(b.date) - new Date(a.date));
};

const addSale = async (data, collection = DEFAULT_COLLECTION) => {
    // ... logic remains same ...
    const { material, quantity, rate, date, remark, customerName, brand, paymentType, paymentStatus } = data;
    // ...
    if (firebaseAvailable()) {
        const ref = db.collection(collection).doc();
        await ref.set({ 
            ...saleData, 
            createdAt: admin.firestore.FieldValue.serverTimestamp() 
        });
        savedSale = { id: ref.id, ...saleData };
    } else {
        savedSale = localStore.insert(collection, saleData);
    }

    // ── NOTE: Removed Cashbook integration per user request ──
    // Sales now act as their own independent ledger.

    return savedSale;
};

const updateSale = async (id, data, collection = DEFAULT_COLLECTION) => {
    if (firebaseAvailable()) {
        await db.collection(collection).doc(id).update(data);
        return { id, ...data };
    } else {
        return localStore.update(collection, id, data);
    }
};

const deleteSale = async (id, brand = 'dump', collection = DEFAULT_COLLECTION) => {
    if (firebaseAvailable()) {
        await db.collection(collection).doc(id).delete();
    } else {
        localStore.delete(collection, id);
    }
};

module.exports = { getAll, addSale, updateSale, deleteSale };
