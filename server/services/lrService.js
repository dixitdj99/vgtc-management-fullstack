const localStore = require('../utils/localStore');

const { db, admin, isAvailable } = require('../firebase');
const firebaseAvailable = () => isAvailable();

const COLLECTION_LR = 'loading_receipts';
const COLLECTION_METADATA = 'metadata';

// ── Firestore helpers ──────────────────────────────────────────────────────────

const firestoreGetNextLrNo = async (metadataCollection = COLLECTION_METADATA) => {
    const metadataRef = db.collection(metadataCollection).doc('lr_counter');
    return await db.runTransaction(async (transaction) => {
        const doc = await transaction.get(metadataRef);
        if (!doc.exists) {
            transaction.set(metadataRef, { count: 1, available: [] });
            return 1;
        }
        const data = doc.data();
        let available = data.available || [];
        if (available.length > 0) {
            const nextNo = Math.min(...available);
            available = available.filter(n => n !== nextNo);
            transaction.update(metadataRef, { available });
            return nextNo;
        }
        const newCount = (data.count || 0) + 1;
        transaction.update(metadataRef, { count: newCount });
        return newCount;
    });
};

const firestoreCreate = async (data, lrCollection = COLLECTION_LR, metadataCollection = COLLECTION_METADATA) => {
    const { materials, date, truckNo, partyName, billing, destination } = data;
    const lrNo = await firestoreGetNextLrNo(metadataCollection);
    const batch = db.batch();
    const createdIds = [];
    materials.forEach((mat) => {
        const ref = db.collection(lrCollection).doc();
        batch.set(ref, {
            lrNo, date: date || new Date().toISOString(), truckNo,
            destination: destination || '',
            material: mat.type, weight: parseFloat(mat.weight) || 0,
            totalBags: parseInt(mat.bags) || 0, 
            billing: mat.billing || billing || 'No',
            partyName, status: 'Created',
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
        createdIds.push(ref.id);
    });
    await batch.commit();
    return { lrNo, ids: createdIds };
};

const firestoreGetAll = async (lrCollection = COLLECTION_LR) => {
    const snapshot = await db.collection(lrCollection).orderBy('createdAt', 'desc').get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

// ── Local store helpers ────────────────────────────────────────────────────────

const localGetNextLrNo = (collectionName = 'lr_no') => {
    return localStore.getCounter(collectionName);
};

const localCreate = (data, lrCollection = COLLECTION_LR, counterCollection = 'lr_no') => {
    const { materials, date, truckNo, partyName, billing, destination } = data;
    const lrNo = localGetNextLrNo(counterCollection);
    const createdIds = [];
    materials.forEach((mat) => {
        const doc = localStore.insert(lrCollection, {
            lrNo, date: date || new Date().toISOString().split('T')[0], truckNo,
            destination: destination || '',
            material: mat.type, weight: parseFloat(mat.weight) || 0,
            totalBags: parseInt(mat.bags) || 0, 
            billing: mat.billing || billing || 'No',
            partyName, status: 'Created'
        });
        createdIds.push(doc.id);
    });
    return { lrNo, ids: createdIds };
};

const localGetAll = (lrCollection = COLLECTION_LR) => {
    return localStore.getAll(lrCollection)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
};

// ── Public API — auto-selects Firebase or local ────────────────────────────────

const createLoadingReceipt = async (data, lrCollection = COLLECTION_LR, counterCollection = COLLECTION_METADATA) => {
    if (firebaseAvailable()) return await firestoreCreate(data, lrCollection, counterCollection);
    // for local store, if the collection is jkl_loading_receipts, use jkl_lr_no for counter
    const localCounter = lrCollection === COLLECTION_LR ? 'lr_no' : lrCollection + '_counter';
    return localCreate(data, lrCollection, localCounter);
};

const getAllLoadingReceipts = async (lrCollection = COLLECTION_LR) => {
    if (firebaseAvailable()) return await firestoreGetAll(lrCollection);
    return localGetAll(lrCollection);
};

const updateBillingStatus = async (id, billing, lrCollection = COLLECTION_LR) => {
    if (firebaseAvailable()) {
        await db.collection(lrCollection).doc(id).update({ billing });
    } else {
        localStore.update(lrCollection, id, { billing });
    }
};

const updateLoadingReceipt = async (id, data, lrCollection = COLLECTION_LR) => {
    const allowed = {};
    if (data.lrNo !== undefined) allowed.lrNo = typeof data.lrNo === 'number' ? data.lrNo : parseInt(data.lrNo);
    if (data.date !== undefined) allowed.date = data.date;
    if (data.truckNo !== undefined) allowed.truckNo = data.truckNo;
    if (data.destination !== undefined) allowed.destination = data.destination;
    if (data.partyName !== undefined) allowed.partyName = data.partyName;
    if (data.billing !== undefined) allowed.billing = data.billing;
    if (data.material !== undefined) allowed.material = data.material;
    if (data.weight !== undefined) allowed.weight = parseFloat(data.weight) || 0;
    if (data.totalBags !== undefined) allowed.totalBags = parseInt(data.totalBags) || 0;
    if (data.status !== undefined) {
        allowed.status = data.status;
        if (data.status === 'Started') allowed.startedAt = new Date().toISOString();
        if (data.status === 'Loaded') {
            allowed.loadedAt = new Date().toISOString();
            // If they skip 'Started' directly to 'Loaded', set startedAt too
            if (!data.startedAt) allowed.startedAt = allowed.loadedAt;
        }
    }
    if (data.invoiceGenerated !== undefined) allowed.invoiceGenerated = data.invoiceGenerated;
    if (data.invoiceNumber !== undefined) allowed.invoiceNumber = data.invoiceNumber;

    if (firebaseAvailable()) {
        await db.collection(lrCollection).doc(id).update({
            ...allowed,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
    } else {
        localStore.update(lrCollection, id, allowed);
    }
};

const deleteLoadingReceipt = async (id, lrCollection = COLLECTION_LR, metadataCollection = COLLECTION_METADATA) => {
    if (firebaseAvailable()) {
        const lrRef = db.collection(lrCollection).doc(id);
        const doc = await lrRef.get();
        if (doc.exists) {
            const { lrNo } = doc.data();
            await lrRef.delete();
            // Check if any other docs have this lrNo
            const otherDocs = await db.collection(lrCollection).where('lrNo', '==', lrNo).limit(1).get();
            if (otherDocs.empty) {
                // If no more docs with this lrNo, make it available for reuse
                const metadataRef = db.collection(metadataCollection).doc('lr_counter');
                await db.runTransaction(async (transaction) => {
                    const mDoc = await transaction.get(metadataRef);
                    if (mDoc.exists) {
                        const data = mDoc.data();
                        const available = data.available || [];
                        if (!available.includes(lrNo)) {
                            available.push(lrNo);
                            transaction.update(metadataRef, { available });
                        }
                    } else {
                        transaction.set(metadataRef, { count: 1, available: [lrNo] });
                    }
                });
            }
        }
    } else {
        localStore.delete(lrCollection, id);
    }
};

const generateBulkInvoice = async (ids, invoiceNumber, invoiceDate, lrCollection = COLLECTION_LR) => {
    if (firebaseAvailable()) {
        const batch = db.batch();
        ids.forEach(id => {
            const ref = db.collection(lrCollection).doc(id);
            batch.update(ref, {
                invoiceNumber,
                invoiceDate,
                invoiceGenerated: true,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        });
        await batch.commit();
    } else {
        ids.forEach(id => {
            localStore.update(lrCollection, id, {
                invoiceNumber,
                invoiceDate,
                invoiceGenerated: true
            });
        });
    }
};

module.exports = {
    createLoadingReceipt,
    getAllLoadingReceipts,
    updateBillingStatus,
    updateLoadingReceipt,
    deleteLoadingReceipt,
    generateBulkInvoice,
};
