const localStore = require('../utils/localStore');
const { db, admin, isAvailable } = require('../firebase');
const { cleanBrands } = require('../utils/partyBrands');
const { getCol, getEnvCol } = require('../utils/collectionUtils');
const { isProduction } = require('../utils/envConfig');
const { isDummyPartyName, getPartySimilarityKey, isLikelyPartyName } = require('../utils/partyNameUtils');

const firebaseAvailable = () => isAvailable();

const PARTY_LOCATIONS = ['jharli', 'kosli', 'jhajjar', 'bahadurgarh'];
const cleanLocations = value => [...new Set((Array.isArray(value) ? value : [])
    .filter(location => PARTY_LOCATIONS.includes(location)))];

const getPartyCol = (req) => (req ? getCol('parties', req) : getEnvCol('parties'));

const normalizePayload = (data = {}) => ({
    ...data,
    name: String(data.name || '').trim().toUpperCase(),
    partyCode: String(data.partyCode || '').trim().toUpperCase(),
    type: data.type || 'customer', // customer, supplier, broker, transporter
    // Which party lists this party appears in — 'jklakshmi', 'jksuper', or
    // both. Empty means untagged, which every module still shows.
    brands: cleanBrands(data.brands),
    locations: cleanLocations(data.locations),
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

const duplicateError = (kind, party) => {
    const err = new Error(kind === 'code'
        ? `Party code already belongs to "${party.name}". Select that party or correct the code.`
        : `Possible duplicate party: "${party.name}". Select existing party or confirm this is a different party.`);
    err.code = kind === 'code' ? 'DUPLICATE_PARTY_CODE' : 'SIMILAR_PARTY';
    err.status = 409;
    err.match = { id: party.id, name: party.name, partyCode: party.partyCode || '' };
    return err;
};

const checkPartyDuplicate = (all, payload, { excludeId = null, allowSimilarParty = false } = {}) => {
    const others = all.filter(p => p.id !== excludeId);
    const exact = others.find(p => getPartySimilarityKey(p.name) === getPartySimilarityKey(payload.name));
    if (exact) throw duplicateError('name', exact);
    const code = String(payload.partyCode || '').trim().toUpperCase();
    const sameCode = code && others.find(p => String(p.partyCode || '').trim().toUpperCase() === code);
    if (sameCode) throw duplicateError('code', sameCode);
    if (!allowSimilarParty) {
        const similar = others.find(p => isLikelyPartyName(p.name, payload.name));
        if (similar) throw duplicateError('name', similar);
    }
};

// ── Public API ─────────────────────────────────────────────────────────────────

const createParty = async (orgId, data, req = null) => {
    const payload = normalizePayload(data);
    delete payload.allowSimilarParty;
    if (!payload.name) throw new Error('Party name is required');

    // Guard: Prevent test or dummy party creation in production
    if (isDummyPartyName(payload.name)) {
        if (isProduction()) {
            throw new Error(`Cannot create test party "${payload.name}" in production`);
        }
    }

    // Check for duplicates
    const all = await getAllParties(orgId, req);
    checkPartyDuplicate(all, payload, { allowSimilarParty: data.allowSimilarParty === true });

    if (firebaseAvailable()) return await firestoreCreate(orgId, payload, req);
    return localCreate({ ...payload, orgId }, req);
};

const getAllParties = async (orgId, req = null) => {
    if (firebaseAvailable()) return await firestoreGetAll(orgId, req);
    return localGetAll(orgId, req);
};

const updateParty = async (id, data, req = null) => {
    const patch = {};
    const allowedFields = ['name', 'partyCode', 'type', 'contactPerson', 'phone', 'email', 'address', 'gstin', 'pan', 'bankDetails', 'openingBalance', 'balanceType', 'isActive', 'brands', 'locations'];

    allowedFields.forEach(field => {
        if (data[field] !== undefined) {
            patch[field] = data[field];
        }
    });

    if (patch.brands !== undefined) patch.brands = cleanBrands(patch.brands);
    if (patch.locations !== undefined) patch.locations = cleanLocations(patch.locations);
    if (patch.name) patch.name = patch.name.trim().toUpperCase();
    if (patch.partyCode !== undefined) patch.partyCode = String(patch.partyCode || '').trim().toUpperCase();
    if (patch.gstin) patch.gstin = patch.gstin.trim().toUpperCase();
    if (patch.pan) patch.pan = patch.pan.trim().toUpperCase();

    if (patch.name !== undefined || patch.partyCode !== undefined) {
        const current = firebaseAvailable()
            ? (await db.collection(getPartyCol(req)).doc(id).get()).data()
            : localStore.getById(getPartyCol(req), id);
        if (current && ((patch.name !== undefined && patch.name !== current.name)
            || (patch.partyCode !== undefined && patch.partyCode !== current.partyCode))) {
            const all = await getAllParties(current.orgId, req);
            checkPartyDuplicate(all, { ...current, ...patch }, {
                excludeId: id, allowSimilarParty: data.allowSimilarParty === true
            });
        }
    }

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

const LR_COLLECTIONS = [
    'loading_receipts', 'jkl_loading_receipts',
    'kosli_loading_receipts', 'jhajjar_loading_receipts', 'bahadurgarh_loading_receipts'
];

const buildPartyLedger = (party, collectionNames, lists) => {
    const partyName = String(party.name || '').trim().replace(/\s+/g, ' ').toUpperCase();
    const matchesParty = item => item?.partyId === party.id ||
        String(item?.partyName || '').trim().replace(/\s+/g, ' ').toUpperCase() === partyName;
    const belongsToParty = item => matchesParty(item) ||
        (Array.isArray(item.deliveries) && item.deliveries.some(matchesParty));
    const byNewest = (a, b) => String(b.date || b.createdAt || '').localeCompare(String(a.date || a.createdAt || ''));
    const vouchers = lists[0].filter(belongsToParty).sort(byNewest);
    const lrs = lists.slice(1).flatMap((items, index) => items
        .filter(belongsToParty)
        .map(item => ({ ...item, collection: collectionNames[index + 1] }))).sort(byNewest);
    const net = voucher => {
        const deliveries = Array.isArray(voucher.deliveries) ? voucher.deliveries : [];
        const gross = deliveries.length
            ? deliveries.reduce((sum, delivery) => sum + (Number(delivery.weight) || 0) * (Number(delivery.rate) || 0), 0)
            : (Number(voucher.weight) || 0) * (Number(voucher.rate) || 0);
        const diesel = voucher.advanceDiesel === 'FULL' ? 4000 : (Number(voucher.advanceDiesel) || 0);
        return gross - diesel - (Number(voucher.advanceCash) || 0) - (Number(voucher.advanceOnline) || 0)
            - (Number(voucher.munshi) || 0) - (Number(voucher.shortage) || 0) - (Number(voucher.commission) || 0);
    };
    const totalNet = vouchers.reduce((sum, voucher) => sum + net(voucher), 0);
    const totalPaid = vouchers.reduce((sum, voucher) => sum + (Number(voucher.paidBalance) || 0), 0);
    return {
        vouchers, lrs,
        summary: {
            trips: vouchers.length, lrCount: lrs.length, totalNet, totalPaid,
            outstanding: Math.max(0, totalNet - totalPaid),
            lastActivity: [vouchers[0]?.date, lrs[0]?.date].filter(Boolean).sort().at(-1) || null
        }
    };
};

const getPartyLedger = async (orgId, partyId, req = null) => {
    const party = (await getAllParties(orgId, req)).find(item => item.id === partyId);
    if (!party) throw new Error('Party not found');
    const collectionNames = ['vouchers', ...LR_COLLECTIONS].map(name => getCol(name, req));
    const lists = firebaseAvailable()
        ? await Promise.all(collectionNames.map(async name => {
            const snapshot = await db.collection(name).where('orgId', '==', orgId).get();
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        }))
        : collectionNames.map(name => localStore.getAll(name).filter(item => item.orgId === orgId));
    return buildPartyLedger(party, collectionNames, lists);
};

module.exports = {
    normalizePayload,
    createParty,
    getAllParties,
    updateParty,
    deleteParty,
    getPartyLedger,
    buildPartyLedger
};

