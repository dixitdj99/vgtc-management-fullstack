const localStore = require('../utils/localStore');

const { db, admin, isAvailable } = require('../firebase');
const firebaseAvailable = () => isAvailable();

const DEFAULT_COLLECTION = 'cashbook';

const getAll = async (collection = DEFAULT_COLLECTION) => {
    if (firebaseAvailable()) {
        const snapshot = await db.collection(collection).orderBy('createdAt', 'desc').get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }
    return localStore.getAll(collection).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
};

const addEntry = async (type, amount, remark = '', date = '', collection = DEFAULT_COLLECTION) => {
    if (!amount || isNaN(amount) || parseFloat(amount) <= 0)
        throw new Error('Amount must be a positive number');

    const entryData = {
        type,                                    // 'deposit' | 'cash_out'
        amount: parseFloat(amount),
        remark: remark || '',
        date: date || new Date().toISOString().slice(0, 10),
    };

    if (firebaseAvailable()) {
        const ref = db.collection(collection).doc();
        await ref.set({ ...entryData, createdAt: admin.firestore.FieldValue.serverTimestamp() });
        return { id: ref.id, ...entryData };
    }

    return localStore.insert(collection, { ...entryData, createdAt: new Date().toISOString() });
};

const deleteEntry = async (id, collection = DEFAULT_COLLECTION) => {
    if (firebaseAvailable()) {
        await db.collection(collection).doc(id).delete();
    } else {
        const entry = localStore.getAll(collection).find(e => e.id === id);
        if (!entry) throw new Error('Entry not found');
        localStore.delete(collection, id);
    }
};

module.exports = { getAll, addEntry, deleteEntry };
