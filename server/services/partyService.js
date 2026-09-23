const localStore = require('../utils/localStore');
const { db, admin, isAvailable } = require('../firebase');
const { cleanBrands } = require('../utils/partyBrands');
const { getCol, getEnvCol } = require('../utils/collectionUtils');
const { isProduction } = require('../utils/envConfig');
const { isDummyPartyName } = require('../utils/partyNameUtils');

const firebaseAvailable = () => isAvailable();

const getPartyCol = (req) => (req ? getCol('parties', req) : getEnvCol('parties'));

const normalizePayload = (data = {}) => ({
    ...data,
    name: String(data.name || '').trim().toUpperCase(),
    type: data.type || 'customer', // customer, supplier, broker, transporter
    // Which party lists this party appears in — 'jklakshmi', 'jksuper', or
    // both. Empty means untagged, which every module still shows.
    brands: cleanBrands(data.brands),
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

const firestoreCreate = async (orgId, data, req = null) => {
    const col = getPartyCol(req);
    const ref = db.collection(col).doc();
    const payload = {
        ...data,
        orgId,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
    };
    await ref.set(payload);
    return { id: ref.id, ...data };
};

const firestoreGetAll = async (orgId, req = null) => {
    const col = getPartyCol(req);
    const snapshot = await db.collection(col)
        .where('orgId', '==', orgId)
        .get();
    const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    return docs.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
};

const firestoreUpdate = async (id, data, req = null) => {
    const col = getPartyCol(req);
    await db.collection(col).doc(id).update({
        ...data,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
};

const firestoreDelete = async (id, req = null) => {
    const col = getPartyCol(req);
    await db.collection(col).doc(id).delete();
};

// ── Local store helpers ────────────────────────────────────────────────────────

const localCreate = (data, req = null) => {
    const col = getPartyCol(req);
    const doc = localStore.insert(col, data);
    return doc;
};

const localGetAll = (orgId, req = null) => {
    const col = getPartyCol(req);
    return localStore.getAll(col)
        .filter(p => p.orgId === orgId)
        .sort((a, b) => a.name.localeCompare(b.name));
};

// ── Public API ─────────────────────────────────────────────────────────────────

const createParty = async (orgId, data, req = null) => {
    const payload = normalizePayload(data);
    if (!payload.name) throw new Error('Party name is required');

    // Guard: Prevent test or dummy party creation in production
    if (isDummyPartyName(payload.name)) {
        if (isProduction()) {
            throw new Error(`Cannot create test party "${payload.name}" in production`);
        }
    }

    // Check for duplicates
    const all = await getAllParties(orgId, req);
    if (all.some(p => p.name === payload.name)) {
        throw new Error(`Party with name "${payload.name}" already exists`);
    }

    if (firebaseAvailable()) return await firestoreCreate(orgId, payload, req);
    return localCreate({ ...payload, orgId }, req);
};

const getAllParties = async (orgId, req = null) => {
    if (firebaseAvailable()) return await firestoreGetAll(orgId, req);
    return localGetAll(orgId, req);
};

const updateParty = async (id, data, req = null) => {
    const patch = {};
    const allowedFields = ['name', 'type', 'contactPerson', 'phone', 'email', 'address', 'gstin', 'pan', 'bankDetails', 'openingBalance', 'balanceType', 'isActive', 'brands'];

    allowedFields.forEach(field => {
        if (data[field] !== undefined) {
            patch[field] = data[field];
        }
    });

    if (patch.brands !== undefined) patch.brands = cleanBrands(patch.brands);
    if (patch.name) patch.name = patch.name.trim().toUpperCase();
    if (patch.gstin) patch.gstin = patch.gstin.trim().toUpperCase();
    if (patch.pan) patch.pan = patch.pan.trim().toUpperCase();

    if (firebaseAvailable()) {
        await firestoreUpdate(id, patch, req);
    } else {
        localStore.update(getPartyCol(req), id, patch);
    }
};

const deleteParty = async (id, req = null) => {
    if (firebaseAvailable()) {
        await firestoreDelete(id, req);
    } else {
        localStore.delete(getPartyCol(req), id);
    }
};

module.exports = {
    createParty,
    getAllParties,
    updateParty,
    deleteParty
};

