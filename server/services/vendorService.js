const localStore = require('../utils/localStore');
const { db, admin, isAvailable } = require('../firebase');
const firebaseAvailable = () => isAvailable();

const COLLECTION = 'vendors';

const normalize = (data = {}) => ({
    ...data,
    name: String(data.name || '').trim().toUpperCase(),
    phone: String(data.phone || '').trim(),
    altPhone: String(data.altPhone || '').trim(),
    address: String(data.address || '').trim(),
    pan: String(data.pan || '').trim().toUpperCase(),
    aadhaar: String(data.aadhaar || '').trim(),
    bankName: String(data.bankName || '').trim(),
    accountNo: String(data.accountNo || '').trim(),
    ifsc: String(data.ifsc || '').trim().toUpperCase(),
    // Rate card — array of { route, ratePerMT, ratePerTrip, notes }
    rateCards: Array.isArray(data.rateCards) ? data.rateCards : [],
    // Vehicle numbers assigned to this vendor
    vehicles: Array.isArray(data.vehicles) ? data.vehicles.map(v => String(v).trim().toUpperCase()) : [],
    notes: String(data.notes || '').trim(),
    isActive: data.isActive !== undefined ? data.isActive : true,
});

// ── Firestore helpers ──────────────────────────────────────────────────────────

const fsCreate = async (orgId, data) => {
    const ref = db.collection(COLLECTION).doc();
    const payload = { ...data, orgId, createdAt: admin.firestore.FieldValue.serverTimestamp() };
    await ref.set(payload);
    return { id: ref.id, ...data };
};

const fsGetAll = async (orgId) => {
    const snap = await db.collection(COLLECTION).where('orgId', '==', orgId).get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
};

const fsUpdate = async (id, data) => {
    await db.collection(COLLECTION).doc(id).update({ ...data, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
};

const fsDelete = async (id) => {
    await db.collection(COLLECTION).doc(id).delete();
};

// ── Local store helpers ────────────────────────────────────────────────────────

const localCreate = (data) => localStore.insert(COLLECTION, data);
const localGetAll = (orgId) => localStore.getAll(COLLECTION).filter(v => v.orgId === orgId).sort((a, b) => (a.name || '').localeCompare(b.name || ''));

// ── Public API ─────────────────────────────────────────────────────────────────

const createVendor = async (orgId, data) => {
    const payload = normalize(data);
    if (!payload.name) throw new Error('Vendor name is required');
    const all = await getAllVendors(orgId);
    if (all.some(v => v.name === payload.name)) throw new Error(`Vendor "${payload.name}" already exists`);
    if (firebaseAvailable()) return await fsCreate(orgId, payload);
    return localCreate({ ...payload, orgId });
};

const getAllVendors = async (orgId) => {
    if (firebaseAvailable()) return await fsGetAll(orgId);
    return localGetAll(orgId);
};

const updateVendor = async (id, data) => {
    const patch = {};
    const allowed = ['name', 'phone', 'altPhone', 'address', 'pan', 'aadhaar', 'bankName', 'accountNo', 'ifsc', 'rateCards', 'vehicles', 'notes', 'isActive'];
    allowed.forEach(f => { if (data[f] !== undefined) patch[f] = data[f]; });
    if (patch.name) patch.name = patch.name.trim().toUpperCase();
    if (patch.pan) patch.pan = patch.pan.trim().toUpperCase();
    if (patch.ifsc) patch.ifsc = patch.ifsc.trim().toUpperCase();
    if (patch.vehicles) patch.vehicles = patch.vehicles.map(v => String(v).trim().toUpperCase());

    if (firebaseAvailable()) {
        await fsUpdate(id, patch);
    } else {
        localStore.update(COLLECTION, id, patch);
    }
};

const deleteVendor = async (id) => {
    if (firebaseAvailable()) await fsDelete(id);
    else localStore.delete(COLLECTION, id);
};

module.exports = { createVendor, getAllVendors, updateVendor, deleteVendor };
