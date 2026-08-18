const localStore = require('../utils/localStore');
const { normalizePartyName } = require('../utils/partyNameUtils');
const { db, admin, isAvailable } = require('../firebase');
const firebaseAvailable = () => isAvailable();
const partyService = require('./partyService');
const { brandOfLr } = require('../utils/partyBrands');
const { getNextEntryId, ensureEntryIds } = require('../utils/entryIdService');

const COLLECTION_LR = 'loading_receipts';
const COLLECTION_METADATA = 'metadata';

/**
 * Party group for an LR collection. The collection name is the one thing every
 * caller already passes that identifies the location — routes and client need
 * no change. Names may carry an env prefix (dev_...), hence includes().
 * Plain 'loading_receipts' is generic orgs: no split.
 */
const groupOfLrCollection = (col = '') => {
    if (col.includes('jkl_loading_receipts')) return 'jklakshmi';
    if (col.includes('kosli_loading_receipts')
        || col.includes('jhajjar_loading_receipts')
        || col.includes('bahadurgarh_loading_receipts')) return 'jksuper';
    return null;
};

// ── Party Sync Helper ──────────────────────────────────────────────────────────
/**
 * Ensures a party exists for `partyName` and returns its id.
 *
 * `group` is the party list this LR belongs to ('jklakshmi' | 'jksuper' |
 * null). A new party is created already tagged with it, so auto-created
 * parties land in the right list instead of leaking into both. If the party
 * exists but lacks the group, the group is ADDED — the same dealer name used
 * on both sides becomes a both-lists party, which is exactly what the tick
 * boxes in Party Master express. Groups are never removed here: an LR proves
 * a party trades somewhere, never that it stopped trading elsewhere.
 */
const syncParty = async (orgId, partyName, group = null) => {
    if (!partyName) return null;
    try {
        const parties = await partyService.getAllParties(orgId);
        let party = parties.find(p => p.name === partyName.toUpperCase());
        if (!party) {
            party = await partyService.createParty(orgId, {
                name: partyName,
                type: 'customer',
                isActive: true,
                brands: group ? [group] : [],
            });
        } else if (group && Array.isArray(party.brands) && party.brands.length && !party.brands.includes(group)) {
            // Tagged, but not with this side — widen it. An untagged party
            // (empty brands) is left for the backfill/Party Master, since it
            // is already visible everywhere.
            await partyService.updateParty(party.id, { brands: [...party.brands, group] });
        }
        return party.id;
    } catch (err) {
        console.error('Failed to sync party for LR:', err);
        return null;
    }
};

// ── Firestore helpers ──────────────────────────────────────────────────────────

/**
 * A number the clerk typed, or null for "give me the next one".
 * Anything that is not a positive whole number is rejected rather than
 * quietly coerced — an LR number is an identity, not an amount.
 */
const readRequestedLrNo = (value) => {
    if (value === undefined || value === null || value === '') return null;
    const reject = () => {
        const e = new Error('LR number must be a whole number above zero');
        e.status = 400;
        throw e;
    };
    // Digits only, and parsed only once they are. parseInt stops at the first
    // character it does not understand, so "12.5abc" reads as 12 and the
    // receipt would be filed under a number nobody typed.
    const raw = typeof value === 'number' ? String(value) : String(value).trim();
    if (!/^\d+$/.test(raw)) reject();
    const n = parseInt(raw, 10);
    if (!Number.isSafeInteger(n) || n <= 0) reject();
    return n;
};

/** Is this LR number already on a receipt in this book? */
const lrNoTaken = async (orgId, lrCollection, lrNo, exceptId = null) => {
    if (firebaseAvailable()) {
        const snap = await db.collection(lrCollection)
            .where('orgId', '==', orgId).where('lrNo', '==', lrNo).limit(2).get();
        return snap.docs.some(d => d.id !== exceptId);
    }
    return localStore.getAll(lrCollection)
        .some(r => r.orgId === orgId && r.lrNo === lrNo && r.id !== exceptId);
};

/**
 * Takes an LR number out of the pool, or claims the one the clerk asked for.
 *
 * A claimed number still has to move the counter: type 500 while the counter
 * sits at 120 and every automatic number from 500 onwards would later collide
 * with it. It is also removed from `available` — the pool of numbers freed by
 * deleted receipts — so it cannot be handed out a second time.
 *
 * Uniqueness against receipts already written is checked by the caller before
 * this runs. Firestore transactions cannot run a query, so two clerks typing
 * the same number in the same instant would both pass; with one clerk per
 * godown that is not a real sequence of events, and the duplicate would be
 * plain to see. The automatic path has no such window.
 */
const firestoreGetNextLrNo = async (orgId, metadataCollection = COLLECTION_METADATA, requested = null) => {
    const metadataRef = db.collection(metadataCollection).doc(`${orgId}_lr_counter`);
    return await db.runTransaction(async (transaction) => {
        const doc = await transaction.get(metadataRef);
        if (!doc.exists) {
            const start = requested || 1;
            transaction.set(metadataRef, { count: start, available: [] });
            return start;
        }
        const data = doc.data();
        let available = data.available || [];

        if (requested !== null) {
            transaction.update(metadataRef, {
                available: available.filter(n => n !== requested),
                count: Math.max(data.count || 0, requested),
            });
            return requested;
        }

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

const firestoreCreate = async (orgId, data, lrCollection = COLLECTION_LR, metadataCollection = COLLECTION_METADATA) => {
    const { materials, date, truckNo, partyName, billing, destination, note, voiceMessageBase64, partyId } = data;
    const group = groupOfLrCollection(lrCollection);
    const normalizedPartyName = normalizePartyName(partyName || '');
    const finalPartyId = partyId || await syncParty(orgId, normalizedPartyName, group);

    const requestedNo = readRequestedLrNo(data.lrNo);
    if (requestedNo !== null && await lrNoTaken(orgId, lrCollection, requestedNo)) {
        { const e = new Error(`LR #${requestedNo} already exists in this book`); e.status = 409; throw e; }
    }
    const lrNo = await firestoreGetNextLrNo(orgId, metadataCollection, requestedNo);
    const batch = db.batch();
    const createdIds = [];
    
    const entryId = await getNextEntryId(orgId, lrCollection);
    // We must handle async in map/forEach carefully. Since syncParty might be needed for material-level parties:
    for (const mat of materials) {
        const matPartyName = normalizePartyName(mat.partyName || normalizedPartyName);
        const matPartyId = mat.partyId || (matPartyName === normalizedPartyName ? finalPartyId : await syncParty(orgId, matPartyName, group));

        const ref = db.collection(lrCollection).doc();
        batch.set(ref, {
            entryId,
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
            orgId,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
        createdIds.push(ref.id);
    }
    await batch.commit();
    return { lrNo, ids: createdIds };
};

const firestoreGetAll = async (orgId, lrCollection = COLLECTION_LR) => {
    const snapshot = await db.collection(lrCollection)
        .where('orgId', '==', orgId)
        .get();
    const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    return docs.sort((a, b) => {
        const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
        const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
        return dateB - dateA;
    });
};

// ── Local store helpers ────────────────────────────────────────────────────────

const localGetNextLrNo = (orgId, collectionName = 'lr_no', requested = null) => {
    if (requested === null) return localStore.getCounter(`${orgId}_${collectionName}`);
    // Walk the counter past a claimed number so the automatic sequence never
    // catches up with it later. getCounter is increment-and-return, so this
    // stops one short and leaves the next call returning requested + 1.
    let n = localStore.getCounter(`${orgId}_${collectionName}`);
    while (n < requested) n = localStore.getCounter(`${orgId}_${collectionName}`);
    return requested;
};

const localCreate = async (orgId, data, lrCollection = COLLECTION_LR, counterCollection = 'lr_no') => {
    const { materials, date, truckNo, partyName, billing, destination, note, voiceMessageBase64, partyId } = data;
    const group = groupOfLrCollection(lrCollection);
    const normalizedPartyName = normalizePartyName(partyName || '');
    const finalPartyId = partyId || await syncParty(orgId, normalizedPartyName, group);

    const requestedNo = readRequestedLrNo(data.lrNo);
    if (requestedNo !== null && await lrNoTaken(orgId, lrCollection, requestedNo)) {
        { const e = new Error(`LR #${requestedNo} already exists in this book`); e.status = 409; throw e; }
    }
    const lrNo = localGetNextLrNo(orgId, counterCollection, requestedNo);
    const createdIds = [];

    const entryId = await getNextEntryId(orgId, lrCollection);
    for (const mat of materials) {
        const matPartyName = normalizePartyName(mat.partyName || normalizedPartyName);
        const matPartyId = mat.partyId || (matPartyName === normalizedPartyName ? finalPartyId : await syncParty(orgId, matPartyName, group));

        const doc = localStore.insert(lrCollection, {
            entryId,
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
            voiceMessageBase64: voiceMessageBase64 || '',
            orgId
        });
        createdIds.push(doc.id);
    }
    return { lrNo, ids: createdIds };
};

const localGetAll = (orgId, lrCollection = COLLECTION_LR) => {
    return localStore.getAll(lrCollection)
        .filter(r => r.orgId === orgId)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
};

// ── Public API — auto-selects Firebase or local ────────────────────────────────

const createLoadingReceipt = async (orgId, data, lrCollection = COLLECTION_LR, counterCollection = COLLECTION_METADATA) => {
    if (data && data.destination) {
        try {
            const destinationService = require('./destinationService');
            destinationService.autoRecordDestination(orgId, {
                name: data.destination,
                rate: data.rate || 0,
                date: data.date
            }).catch(() => {});
        } catch (e) {}
    }
    if (firebaseAvailable()) return await firestoreCreate(orgId, data, lrCollection, counterCollection);
    // for local store, if the collection is jkl_loading_receipts, use jkl_lr_no for counter
    const localCounter = lrCollection === COLLECTION_LR ? 'lr_no' : lrCollection + '_counter';
    return await localCreate(orgId, data, lrCollection, localCounter);
};

const getAllLoadingReceipts = async (orgId, lrCollection = COLLECTION_LR) => {
    await ensureEntryIds(orgId, lrCollection).catch(() => {});
    if (firebaseAvailable()) return await firestoreGetAll(orgId, lrCollection);
    return localGetAll(orgId, lrCollection);
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
    if (data.lrNo !== undefined) {
        // Editing the number could always collide; nothing checked it before,
        // and letting a clerk type one makes it far likelier. A receipt shares
        // its number with its own other material rows, so those are excluded.
        const wanted = readRequestedLrNo(data.lrNo);
        if (wanted === null) { const e = new Error('LR number cannot be blank'); e.status = 400; throw e; }
        const current = firebaseAvailable()
            ? (await db.collection(lrCollection).doc(id).get()).data()
            : localStore.getById(lrCollection, id);
        if (current && current.lrNo !== wanted) {
            const orgId = current.orgId;
            if (await lrNoTaken(orgId, lrCollection, wanted)) {
                { const e = new Error(`LR #${wanted} already exists in this book`); e.status = 409; throw e; }
            }
        }
        allowed.lrNo = wanted;
    }
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
        // localStore exposes getById, not get — the latter threw on every
        // local-mode update.
        const current = localStore.getById(lrCollection, id);
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
                        // orgId_lr_counter should match naming in GetNextLrNo
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
