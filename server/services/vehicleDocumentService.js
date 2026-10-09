const { db, admin, isAvailable } = require('../firebase');
const localStore = require('../utils/localStore');
const { randomUUID } = require('crypto');

const TYPES = new Set(['pollution', 'fitness', 'insurance']);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function normalizeRenewal(input = {}) {
    const documentType = String(input.documentType || '').toLowerCase();
    const amount = Number(input.amount);
    const { paidOn, validFrom, expiresOn } = input;
    if (!TYPES.has(documentType)) throw new Error('Document must be Pollution, Fitness, or Insurance');
    for (const [label, value] of [['Payment date', paidOn], ['Valid from', validFrom], ['Next expiry', expiresOn]]) {
        const date = new Date(`${value}T00:00:00Z`);
        if (!DATE_RE.test(String(value || '')) || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error(`${label} must be a valid date`);
    }
    if (expiresOn <= validFrom) throw new Error('Next expiry must be after valid-from date');
    if (!Number.isFinite(amount) || amount < 0) throw new Error('Payment amount must be zero or greater');
    return {
        documentType, paidOn, validFrom, expiresOn, amount,
        paymentMethod: String(input.paymentMethod || '').trim().slice(0, 60),
        reference: String(input.reference || '').trim().slice(0, 120),
        notes: String(input.notes || '').trim().slice(0, 500),
    };
}

function parseDocs(value) {
    if (value && typeof value === 'object') return { ...value };
    try { return { ...JSON.parse(value || '{}') }; } catch { return {}; }
}

async function addRenewal(orgId, vehicleId, input, col = 'vehicles') {
    const renewal = { ...normalizeRenewal(input), id: randomUUID(), createdAt: new Date().toISOString() };
    if (isAvailable()) {
        const ref = db.collection(col).doc(vehicleId);
        await db.runTransaction(async tx => {
            const snap = await tx.get(ref);
            if (!snap.exists || snap.data().orgId !== orgId) throw new Error('Vehicle not found');
            const vehicle = snap.data();
            const docs = parseDocs(vehicle.docs);
            docs[renewal.documentType] = renewal.expiresOn;
            tx.update(ref, {
                docs: JSON.stringify(docs),
                documentRenewals: admin.firestore.FieldValue.arrayUnion(renewal),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
        });
    } else {
        const vehicle = localStore.getAll(col).find(v => v.id === vehicleId && v.orgId === orgId);
        if (!vehicle) throw new Error('Vehicle not found');
        const docs = parseDocs(vehicle.docs);
        docs[renewal.documentType] = renewal.expiresOn;
        localStore.update(col, vehicleId, {
            docs: JSON.stringify(docs),
            documentRenewals: [...(vehicle.documentRenewals || []), renewal],
            updatedAt: renewal.createdAt,
        });
    }
    return renewal;
}

module.exports = { TYPES, normalizeRenewal, addRenewal };
