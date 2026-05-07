const localStore = require('../utils/localStore');
const { db, admin, isAvailable } = require('../firebase');
const firebaseAvailable = () => isAvailable();
const partyService = require('./partyService');

const COLLECTION_VEHICLES = 'vehicles';
const normalizeTruckNo = (value) => String(value || '').toUpperCase().replace(/\s/g, '');

const normalizeVehiclePayload = (data = {}) => ({
    ...data,
    truckNo: normalizeTruckNo(data.truckNo),
    ownerName: String(data.ownerName || '').trim(),
    ownerId: data.ownerId || null,
    ownerContact: String(data.ownerContact || '').trim(),
    driverName: String(data.driverName || '').trim(),
    driverContact: String(data.driverContact || '').trim(),
    vehicleType: data.vehicleType || 'Trailer',
    make: data.make || 'Tata',
    model: data.model || '',
    grossWeight: parseFloat(data.grossWeight) || 0,
    unladenWeight: parseFloat(data.unladenWeight) || 0,
    regDate: data.regDate || '',
    nationalPermitDate: data.nationalPermitDate || '',
    rcDetails: data.rcDetails || '',
    docNumbers: data.docNumbers || '',
    emiDetails: data.emiDetails || '',
    docs: data.docs || '',
    fastag: data.fastag || '',
    bankDetails: data.bankDetails || '',
    gpsType: data.gpsType || 'none',
    targetMileage: parseFloat(data.targetMileage) || 0
});

const normalizeVehiclePatch = (data = {}) => {
    const patch = { ...data };
    if (data.truckNo !== undefined) patch.truckNo = normalizeTruckNo(data.truckNo);
    if (data.ownerName !== undefined) patch.ownerName = String(data.ownerName || '').trim();
    if (data.ownerId !== undefined) patch.ownerId = data.ownerId || null;
    if (data.ownerContact !== undefined) patch.ownerContact = String(data.ownerContact || '').trim();
    if (data.driverName !== undefined) patch.driverName = String(data.driverName || '').trim();
    if (data.driverContact !== undefined) patch.driverContact = String(data.driverContact || '').trim();
    if (data.vehicleType !== undefined) patch.vehicleType = data.vehicleType || 'Trailer';
    if (data.bankDetails !== undefined) patch.bankDetails = data.bankDetails || '';
    if (data.gpsType !== undefined) patch.gpsType = data.gpsType || 'none';
    return patch;
};

// ── Firestore helpers ──────────────────────────────────────────────────────────

const firestoreCreate = async (orgId, data, col = COLLECTION_VEHICLES) => {
    const ref = db.collection(col).doc();
    const payload = {
        ...data,
        orgId,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
    };
    await ref.set(payload);
    return { id: ref.id, ...data };
};

const firestoreGetAll = async (orgId, col = COLLECTION_VEHICLES) => {
    const snapshot = await db.collection(col)
        .where('orgId', '==', orgId)
        .get();
    const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    return docs.sort((a, b) => {
        const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
        const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
        return dateB - dateA;
    });
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

const localGetAll = (orgId, col = COLLECTION_VEHICLES) => {
    return localStore.getAll(col)
        .filter(v => v.orgId === orgId)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
};

const findVehicleByTruckNo = async (orgId, truckNo, col = COLLECTION_VEHICLES) => {
    const normalizedTruckNo = normalizeTruckNo(truckNo);
    if (!normalizedTruckNo) return null;

    if (firebaseAvailable()) {
        const snapshot = await db.collection(col)
            .where('orgId', '==', orgId)
            .where('truckNo', '==', normalizedTruckNo)
            .limit(1)
            .get();
        if (snapshot.empty) return null;
        const doc = snapshot.docs[0];
        return { id: doc.id, ...doc.data() };
    }

    return localStore.getAll(col).find(v => v.orgId === orgId && normalizeTruckNo(v.truckNo) === normalizedTruckNo) || null;
};

// ── Party Sync Helper ──────────────────────────────────────────────────────────
const syncParty = async (orgId, ownerName, ownerContact, bankDetails) => {
    if (!ownerName || ownerName.toLowerCase() === 'vikas transport (self)') return null;
    try {
        const parties = await partyService.getAllParties(orgId);
        let party = parties.find(p => p.name === ownerName.toUpperCase());
        if (!party) {
            // Auto-create basic party record
            party = await partyService.createParty(orgId, {
                name: ownerName,
                type: 'transporter',
                phone: ownerContact || '',
                bankDetails: bankDetails || '',
                isActive: true
            });
        } else if (bankDetails && !party.bankDetails) {
            // Upgrade party bank details if missing
            await partyService.updateParty(party.id, { bankDetails });
        }
        return party.id;
    } catch (err) {
        console.error('Failed to sync party for vehicle:', err);
        return null;
    }
};

// ── Public API ─────────────────────────────────────────────────────────────────

const createVehicle = async (orgId, data, col = COLLECTION_VEHICLES) => {
    const payload = normalizeVehiclePayload(data);
    if (!payload.truckNo) throw new Error('Truck number required');

    const existing = await findVehicleByTruckNo(orgId, payload.truckNo, col);
    if (existing) throw new Error(`Vehicle already exists for truck ${payload.truckNo}`);

    // Auto-sync or resolve Party ID
    if (!payload.ownerId && payload.ownerName) {
        payload.ownerId = await syncParty(orgId, payload.ownerName, payload.ownerContact, payload.bankDetails);
    }

    if (firebaseAvailable()) return await firestoreCreate(orgId, payload, col);
    return localCreate({ ...payload, orgId }, col);
};

const getAllVehicles = async (orgId, col = COLLECTION_VEHICLES) => {
    if (firebaseAvailable()) return await firestoreGetAll(orgId, col);
    return localGetAll(orgId, col);
};

const updateVehicle = async (orgId, id, data, col = COLLECTION_VEHICLES) => {
    const allowed = normalizeVehiclePatch(data);
    delete allowed.id;
    delete allowed.createdAt;

    if (allowed.truckNo) {
        const existing = await findVehicleByTruckNo(orgId, allowed.truckNo, col);
        if (existing && existing.id !== id) {
            throw new Error(`Vehicle already exists for truck ${allowed.truckNo}`);
        }
    }

    // Auto-sync or resolve Party ID
    if (allowed.ownerName && !allowed.ownerId) {
        allowed.ownerId = await syncParty(orgId, allowed.ownerName, allowed.ownerContact, allowed.bankDetails);
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

const ensureVehicleByTruckNo = async (orgId, truckNo, col = COLLECTION_VEHICLES) => {
    const normalizedTruckNo = normalizeTruckNo(truckNo);
    if (!normalizedTruckNo) return null;

    const existing = await findVehicleByTruckNo(orgId, normalizedTruckNo, col);
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

    if (firebaseAvailable()) return await firestoreCreate(orgId, payload, col);
    return localCreate({ ...payload, orgId }, col);
};

module.exports = {
    createVehicle,
    getAllVehicles,
    updateVehicle,
    deleteVehicle,
    ensureVehicleByTruckNo
};
