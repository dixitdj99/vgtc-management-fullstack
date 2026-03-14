const localStore = require('../utils/localStore');

const { db, admin, isAvailable } = require('../firebase');
const firebaseAvailable = () => isAvailable();

const COLLECTION_VEHICLES = 'vehicles';

// ── Firestore helpers ──────────────────────────────────────────────────────────

const firestoreCreate = async (data) => {
    const ref = db.collection(COLLECTION_VEHICLES).doc();
    const payload = {
        ...data,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
    };
    await ref.set(payload);
    return { id: ref.id, ...data };
};

const firestoreGetAll = async () => {
    const snapshot = await db.collection(COLLECTION_VEHICLES).orderBy('createdAt', 'desc').get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

const firestoreUpdate = async (id, data) => {
    await db.collection(COLLECTION_VEHICLES).doc(id).update({
        ...data,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
};

const firestoreDelete = async (id) => {
    await db.collection(COLLECTION_VEHICLES).doc(id).delete();
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

const createVehicle = async (data) => {
    // Expected fields: truckNo, ownerName, ownerContact, driverName, driverContact, type, bankDetails, etc.
    if (firebaseAvailable()) return await firestoreCreate(data);
    return localCreate(data);
};

const getAllVehicles = async () => {
    if (firebaseAvailable()) return await firestoreGetAll();
    return localGetAll();
};

const updateVehicle = async (id, data) => {
    const allowed = { ...data };
    delete allowed.id;
    delete allowed.createdAt;

    if (firebaseAvailable()) {
        await firestoreUpdate(id, allowed);
    } else {
        localStore.update(COLLECTION_VEHICLES, id, allowed);
    }
};

const deleteVehicle = async (id) => {
    if (firebaseAvailable()) {
        await firestoreDelete(id);
    } else {
        localStore.delete(COLLECTION_VEHICLES, id);
    }
};

module.exports = {
    createVehicle,
    getAllVehicles,
    updateVehicle,
    deleteVehicle
};
