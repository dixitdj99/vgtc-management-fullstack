const localStore = require('../utils/localStore');
const { db, admin, isAvailable } = require('../firebase');
const firebaseAvailable = () => isAvailable();

const COLLECTION_VEHICLES = 'vehicles';
const normalizeTruckNo = (value) => String(value || '').toUpperCase().replace(/\s/g, '');

const normalizeVehiclePayload = (data = {}) => ({
    ...data,
    truckNo: normalizeTruckNo(data.truckNo),
    ownerName: String(data.ownerName || '').trim(),
    ownerContact: String(data.ownerContact || '').trim(),
    driverName: String(data.driverName || '').trim(),
    driverContact: String(data.driverContact || '').trim(),
    vehicleType: data.vehicleType || 'Trailer',
    bankDetails: data.bankDetails || '',
    gpsType: data.gpsType || 'none'
});

const normalizeVehiclePatch = (data = {}) => {
    const patch = { ...data };
    if (data.truckNo !== undefined) patch.truckNo = normalizeTruckNo(data.truckNo);
    if (data.ownerName !== undefined) patch.ownerName = String(data.ownerName || '').trim();
    if (data.ownerContact !== undefined) patch.ownerContact = String(data.ownerContact || '').trim();
    if (data.driverName !== undefined) patch.driverName = String(data.driverName || '').trim();
    if (data.driverContact !== undefined) patch.driverContact = String(data.driverContact || '').trim();
    if (data.vehicleType !== undefined) patch.vehicleType = data.vehicleType || 'Trailer';
    if (data.bankDetails !== undefined) patch.bankDetails = data.bankDetails || '';
    if (data.gpsType !== undefined) patch.gpsType = data.gpsType || 'none';
    return patch;
};

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

const localCreate = (data, col = COLLECTION_VEHICLES) => {
    const doc = localStore.insert(col, data);
    return doc;
};

const localGetAll = (col = COLLECTION_VEHICLES) => {
    return localStore.getAll(col)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
};

const findVehicleByTruckNo = async (truckNo, col = COLLECTION_VEHICLES) => {
    const normalizedTruckNo = normalizeTruckNo(truckNo);
    if (!normalizedTruckNo) return null;

    if (firebaseAvailable()) {
        const snapshot = await db.collection(col)
            .where('truckNo', '==', normalizedTruckNo)
            .limit(1)
            .get();
        if (snapshot.empty) return null;
        const doc = snapshot.docs[0];
        return { id: doc.id, ...doc.data() };
    }

    return localStore.getAll(col).find(v => normalizeTruckNo(v.truckNo) === normalizedTruckNo) || null;
};

// ── Public API ─────────────────────────────────────────────────────────────────

const createVehicle = async (data, col = COLLECTION_VEHICLES) => {
    // Expected fields: truckNo, ownerName, ownerContact, driverName, driverContact, type, bankDetails, etc.
    const payload = normalizeVehiclePayload(data);
    if (!payload.truckNo) throw new Error('Truck number required');

    const existing = await findVehicleByTruckNo(payload.truckNo, col);
    if (existing) throw new Error(`Vehicle already exists for truck ${payload.truckNo}`);

    if (firebaseAvailable()) return await firestoreCreate(payload, col);
    return localCreate(payload, col);
};

const getAllVehicles = async (col = COLLECTION_VEHICLES) => {
    if (firebaseAvailable()) return await firestoreGetAll(col);
    return localGetAll(col);
};

const updateVehicle = async (id, data, col = COLLECTION_VEHICLES) => {
    const allowed = normalizeVehiclePatch(data);
    delete allowed.id;
    delete allowed.createdAt;

    if (allowed.truckNo) {
        const existing = await findVehicleByTruckNo(allowed.truckNo, col);
        if (existing && existing.id !== id) {
            throw new Error(`Vehicle already exists for truck ${allowed.truckNo}`);
        }
    }

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

const ensureVehicleByTruckNo = async (truckNo, col = COLLECTION_VEHICLES) => {
    const normalizedTruckNo = normalizeTruckNo(truckNo);
    if (!normalizedTruckNo) return null;

    const existing = await findVehicleByTruckNo(normalizedTruckNo, col);
    if (existing) return existing;

    const payload = normalizeVehiclePayload({
        truckNo: normalizedTruckNo,
        ownerName: '',
        ownerContact: '',
        driverName: '',
        driverContact: '',
        vehicleType: 'Trailer',
        bankDetails: '',
        source: 'voucher_auto'
    });

    if (firebaseAvailable()) return await firestoreCreate(payload, col);
    return localCreate(payload, col);
};

module.exports = {
    createVehicle,
    getAllVehicles,
    updateVehicle,
    deleteVehicle,
    ensureVehicleByTruckNo
};
