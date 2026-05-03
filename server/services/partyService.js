const localStore = require('../utils/localStore');
const { db, admin, isAvailable } = require('../firebase');
const firebaseAvailable = () => isAvailable();

const COLLECTION_PARTIES = 'parties';

const normalizePayload = (data = {}) => ({
    ...data,
    name: String(data.name || '').trim().toUpperCase(),
    type: data.type || 'customer', // customer, supplier, broker, transporter
    contactPerson: String(data.contactPerson || '').trim(),
    phone: String(data.phone || '').trim(),
    email: String(data.email || '').trim(),
    address: String(data.address || '').trim(),
    gstin: String(data.gstin || '').trim().toUpperCase(),
    pan: String(data.pan || '').trim().toUpperCase(),
    bankDetails: data.bankDetails || '',
    openingBalance: Number(data.openingBalance) || 0,
    balanceType: data.balanceType || 'credit', // debit (we owe them) or credit (they owe us)
    isActive: data.isActive !== undefined ? data.isActive : true
});

// ── Firestore helpers ──────────────────────────────────────────────────────────

const firestoreCreate = async (data) => {
    const ref = db.collection(COLLECTION_PARTIES).doc();
    const payload = {
        ...data,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
    };
    await ref.set(payload);
    return { id: ref.id, ...data };
};

const firestoreGetAll = async () => {
    const snapshot = await db.collection(COLLECTION_PARTIES).orderBy('name', 'asc').get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

const firestoreUpdate = async (id, data) => {
    await db.collection(COLLECTION_PARTIES).doc(id).update({
        ...data,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
};

const firestoreDelete = async (id) => {
    await db.collection(COLLECTION_PARTIES).doc(id).delete();
};

// ── Local store helpers ────────────────────────────────────────────────────────

const localCreate = (data) => {
    const doc = localStore.insert(COLLECTION_PARTIES, data);
    return doc;
};

const localGetAll = () => {
    return localStore.getAll(COLLECTION_PARTIES)
        .sort((a, b) => a.name.localeCompare(b.name));
};

// ── Public API ─────────────────────────────────────────────────────────────────

const createParty = async (data) => {
    const payload = normalizePayload(data);
    if (!payload.name) throw new Error('Party name is required');

    // Check for duplicates
    const all = await getAllParties();
    if (all.some(p => p.name === payload.name)) {
        throw new Error(`Party with name "${payload.name}" already exists`);
    }

    if (firebaseAvailable()) return await firestoreCreate(payload);
    return localCreate(payload);
};

const getAllParties = async () => {
    if (firebaseAvailable()) return await firestoreGetAll();
    return localGetAll();
};

const updateParty = async (id, data) => {
    const patch = {};
    const allowedFields = ['name', 'type', 'contactPerson', 'phone', 'email', 'address', 'gstin', 'pan', 'bankDetails', 'openingBalance', 'balanceType', 'isActive'];
    
    allowedFields.forEach(field => {
        if (data[field] !== undefined) {
            patch[field] = data[field];
        }
    });

    if (patch.name) patch.name = patch.name.trim().toUpperCase();
    if (patch.gstin) patch.gstin = patch.gstin.trim().toUpperCase();
    if (patch.pan) patch.pan = patch.pan.trim().toUpperCase();

    if (firebaseAvailable()) {
        await firestoreUpdate(id, patch);
    } else {
        localStore.update(COLLECTION_PARTIES, id, patch);
    }
};

const deleteParty = async (id) => {
    if (firebaseAvailable()) {
        await firestoreDelete(id);
    } else {
        localStore.delete(COLLECTION_PARTIES, id);
    }
};

module.exports = {
    createParty,
    getAllParties,
    updateParty,
    deleteParty
};
