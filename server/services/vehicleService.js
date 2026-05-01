const localStore = require('../utils/localStore');

const { db, admin, isAvailable } = require('../firebase');
const firebaseAvailable = () => isAvailable();

const COLLECTION_VEHICLES = 'vehicles';

// ── Firestore helpers ──────────────────────────────────────────────────────────

const firestoreCreate = async (data, col = COLLECTION_VEHICLES) => {
    const ref = db.collection(col).doc();
    const payload = {
        ...data,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
    };
    await ref.set(payload);
    return { id: ref.id, ...data };
};

const firestoreGetAll = async (col = COLLECTION_VEHICLES) => {
    const snapshot = await db.collection(col).orderBy('createdAt', 'desc').get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

const firestoreUpdate = async (id, data, col = COLLECTION_VEHICLES) => {
    await db.collection(col).doc(id).update({
        ...data,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
};

const firestoreDelete = async (id, col = COLLECTION_VEHICLES) => {
    await db.collection(col).doc(id).delete();
};

// ── Local store helpers ────────────────────────────────────────────────────────

const localCreate = (data) => {
    const doc = localStore.insert(COLLECTION_VEHICLES, data);
    return doc;
};

const localGetAll = () => {
    return localStore.getAll(COLLECTION_VEHICLES)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
};

// ── Public API ─────────────────────────────────────────────────────────────────

const createVehicle = async (data, col = COLLECTION_VEHICLES) => {
    // Expected fields: truckNo, ownerName, ownerContact, driverName, driverContact, type, bankDetails, etc.
    if (firebaseAvailable()) return await firestoreCreate(data, col);
    return localStore.insert(col, data);
};

const getAllVehicles = async (col = COLLECTION_VEHICLES) => {
    if (firebaseAvailable()) return await firestoreGetAll(col);
    return localStore.getAll(col).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
};

const updateVehicle = async (id, data, col = COLLECTION_VEHICLES) => {
    const allowed = { ...data };
    delete allowed.id;
    delete allowed.createdAt;

    if (firebaseAvailable()) {
        await firestoreUpdate(id, allowed, col);
    } else {
        localStore.update(col, id, allowed);
    }
};

const deleteVehicle = async (id, col = COLLECTION_VEHICLES) => {
    if (firebaseAvailable()) {
        await firestoreDelete(id, col);
    } else {
        localStore.delete(col, id);
    }
};

module.exports = {
    createVehicle,
    getAllVehicles,
    updateVehicle,
    deleteVehicle
};
