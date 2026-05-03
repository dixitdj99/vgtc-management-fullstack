const localStore = require('../utils/localStore');
const { normalizePartyName } = require('../utils/partyNameUtils');
const { db, admin, isAvailable } = require('../firebase');
const firebaseAvailable = () => isAvailable();
const partyService = require('./partyService');

const COLLECTION_LR = 'loading_receipts';
const COLLECTION_METADATA = 'metadata';

// ── Party Sync Helper ──────────────────────────────────────────────────────────
const syncParty = async (partyName) => {
    if (!partyName) return null;
    try {
        const parties = await partyService.getAllParties();
        let party = parties.find(p => p.name === partyName.toUpperCase());
        if (!party) {
            party = await partyService.createParty({
                name: partyName,
                type: 'customer',
                isActive: true
            });
        }
        return party.id;
    } catch (err) {
        console.error('Failed to sync party for LR:', err);
        return null;
    }
};

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
    const { materials, date, truckNo, partyName, billing, destination, note, voiceMessageBase64, partyId } = data;
    const normalizedPartyName = normalizePartyName(partyName || '');
    const finalPartyId = partyId || await syncParty(normalizedPartyName);

    const lrNo = await firestoreGetNextLrNo(metadataCollection);
    const batch = db.batch();
    const createdIds = [];
    
    // We must handle async in map/forEach carefully. Since syncParty might be needed for material-level parties:
    for (const mat of materials) {
        const matPartyName = normalizePartyName(mat.partyName || normalizedPartyName);
        const matPartyId = mat.partyId || (matPartyName === normalizedPartyName ? finalPartyId : await syncParty(matPartyName));

        const ref = db.collection(lrCollection).doc();
        batch.set(ref, {
            lrNo, date: date || new Date().toISOString(), truckNo,
            destination: destination || '',
            material: mat.type, 
            loadingType: mat.loadingType || 'From Godown',
            weight: parseFloat(mat.weight) || 0,
            totalBags: parseInt(mat.bags) || 0, 
            billing: mat.billing || billing || 'No',
            partyName: matPartyName,
            partyId: matPartyId || null,
            status: 'Created',
            note: note || '',
            voiceMessageBase64: voiceMessageBase64 || '',
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
        createdIds.push(ref.id);
    }
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

const localCreate = async (data, lrCollection = COLLECTION_LR, counterCollection = 'lr_no') => {
    const { materials, date, truckNo, partyName, billing, destination, note, voiceMessageBase64, partyId } = data;
    const normalizedPartyName = normalizePartyName(partyName || '');
    const finalPartyId = partyId || await syncParty(normalizedPartyName);
    
    const lrNo = localGetNextLrNo(counterCollection);
    const createdIds = [];
    
    for (const mat of materials) {
        const matPartyName = normalizePartyName(mat.partyName || normalizedPartyName);
        const matPartyId = mat.partyId || (matPartyName === normalizedPartyName ? finalPartyId : await syncParty(matPartyName));

        const doc = localStore.insert(lrCollection, {
            lrNo, date: date || new Date().toISOString().split('T')[0], truckNo,
            destination: destination || '',
            material: mat.type,
            loadingType: mat.loadingType || 'From Godown',
            weight: parseFloat(mat.weight) || 0,
            totalBags: parseInt(mat.bags) || 0, 
            billing: mat.billing || billing || 'No',
            partyName: matPartyName,
            partyId: matPartyId || null,
            status: 'Created',
            note: note || '',
            voiceMessageBase64: voiceMessageBase64 || ''
        });
        createdIds.push(doc.id);
    }
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
    return await localCreate(data, lrCollection, localCounter);
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
    if (data.partyName !== undefined) allowed.partyName = normalizePartyName(data.partyName || '');
    if (data.billing !== undefined) allowed.billing = data.billing;
    if (data.material !== undefined) allowed.material = data.material;
    if (data.loadingType !== undefined) allowed.loadingType = data.loadingType;
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
    if (data.note !== undefined) allowed.note = data.note;
    if (data.voiceMessageBase64 !== undefined) allowed.voiceMessageBase64 = data.voiceMessageBase64;

    if (firebaseAvailable()) {
        const docRef = db.collection(lrCollection).doc(id);
        
        // Propagate global fields (note, voice) to all docs with same lrNo
        if (allowed.note !== undefined || allowed.voiceMessageBase64 !== undefined) {
            try {
                const doc = await docRef.get();
                if (doc.exists) {
                    const { lrNo } = doc.data();
                    if (lrNo) {
                        const snap = await db.collection(lrCollection).where('lrNo', '==', lrNo).get();
                        const batch = db.batch();
                        snap.docs.forEach(d => {
                            const updateData = { updatedAt: admin.firestore.FieldValue.serverTimestamp() };
                            if (allowed.note !== undefined) updateData.note = allowed.note;
                            if (allowed.voiceMessageBase64 !== undefined) updateData.voiceMessageBase64 = allowed.voiceMessageBase64;
                            batch.update(d.ref, updateData);
                        });
                        await batch.commit();
                    }
                }
            } catch (err) {
                console.error('Failed to propagate LR note/voice:', err);
            }
        }

        await docRef.update({
            ...allowed,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
    } else {
        localStore.update(lrCollection, id, allowed);
        // Propagation for local store (optional, but good for parity)
        const current = localStore.get(lrCollection, id);
        if (current && current.lrNo && (allowed.note !== undefined || allowed.voiceMessageBase64 !== undefined)) {
            const others = localStore.getAll(lrCollection).filter(r => r.lrNo === current.lrNo && r.id !== id);
            others.forEach(o => {
                const up = {};
                if (allowed.note !== undefined) up.note = allowed.note;
                if (allowed.voiceMessageBase64 !== undefined) up.voiceMessageBase64 = allowed.voiceMessageBase64;
                localStore.update(lrCollection, o.id, up);
            });
        }
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
