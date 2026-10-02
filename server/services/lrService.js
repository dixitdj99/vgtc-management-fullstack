const localStore = require('../utils/localStore');
const { normalizePartyName, isDummyPartyName } = require('../utils/partyNameUtils');
const { db, admin, isAvailable } = require('../firebase');
const firebaseAvailable = () => isAvailable();
const partyService = require('./partyService');
const { getEnvPrefix } = require('../utils/envConfig');
const { brandOfLr } = require('../utils/partyBrands');
const { getNextEntryId, getNextSixDigitEntryId, ensureEntryIds } = require('../utils/entryIdService');
const { billTypeForCollection, voucherCollectionForLr, validateBillDetails, billLrNumbers, buildBillFromLr } = require('./lrBillService');

const COLLECTION_LR = 'loading_receipts';
const COLLECTION_METADATA = 'metadata';

/**
 * Creation invariant shared by every LR route (Jharli, JKL, Kosli, Jhajjar,
 * Bahadurgarh and the legacy route). UI validation is helpful, but this is the
 * final guard for mobile clients, imports and direct API calls.
 */
const validateLrMaterials = (materials) => {
    const fail = (message) => {
        const error = new Error(message);
        error.status = 400;
        throw error;
    };
    if (!Array.isArray(materials) || materials.length === 0) {
        fail('At least one material with type, loading type, bags and weight is required');
    }
    materials.forEach((material, index) => {
        const row = index + 1;
        if (!material || typeof material !== 'object') fail(`Material #${row} details are required`);
        if (!String(material.type || '').trim()) fail(`Material #${row}: material type is required`);
        if (!String(material.loadingType || '').trim()) fail(`Material #${row}: loading type is required`);

        const bags = Number(material.bags);
        if (!Number.isInteger(bags) || bags <= 0) {
            fail(`Material #${row}: bags must be a whole number above zero`);
        }
        const weight = Number(material.weight);
        if (!Number.isFinite(weight) || weight <= 0) {
            fail(`Material #${row}: weight must be above zero`);
        }
    });
    return true;
};

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

const locationOfLrCollection = (col = '') => {
    if (col.includes('jkl_loading_receipts')) return 'jharli';
    if (col.includes('kosli_loading_receipts')) return 'kosli';
    if (col.includes('jhajjar_loading_receipts')) return 'jhajjar';
    if (col.includes('bahadurgarh_loading_receipts')) return 'bahadurgarh';
    return null;
};

// ── Party Sync Helper ──────────────────────────────────────────────────────────
/**
 * Ensures a party exists for `partyName` in the LR's environment/sandbox.
 * Adds the source brand and site without removing existing tags. The first
 * nonblank manual code becomes the master code; conflicting existing codes
 * must be resolved explicitly in Party Master.
 */
const partyScopeForLrCollection = collection => ({
    user: { isSandbox: String(collection).startsWith(`${getEnvPrefix()}test_`) }
});

const syncParty = async (orgId, partyName, group = null, location = null, partyCode = '', partyId = null, partyScope = null) => {
    if (!partyName || isDummyPartyName(partyName)) return null;
    try {
        const parties = await partyService.getAllParties(orgId, partyScope);
        let party = parties.find(p => p.id === partyId && normalizePartyName(p.name) === normalizePartyName(partyName))
            || parties.find(p => normalizePartyName(p.name) === normalizePartyName(partyName));
        const code = String(partyCode || '').trim().toUpperCase();
        if (!party) {
            party = await partyService.createParty(orgId, {
                name: partyName,
                type: 'customer',
                isActive: true,
                brands: group ? [group] : [],
                locations: location ? [location] : [],
                partyCode: code,
            }, partyScope);
        } else {
            const patch = {};
            const brands = Array.isArray(party.brands) ? party.brands : [];
            const locations = Array.isArray(party.locations) ? party.locations : [];
            if (group && !brands.includes(group)) patch.brands = [...brands, group];
            if (location && !locations.includes(location)) patch.locations = [...locations, location];
            // LR code fills a blank master code. A different existing code
            // requires an explicit edit in Party Master; never replace it here.
            if (code && !String(party.partyCode || '').trim()) patch.partyCode = code;
            if (Object.keys(patch).length) await partyService.updateParty(party.id, patch, partyScope);
        }
        return party.id;
    } catch (err) {
        console.error('Failed to sync party for LR:', err);
        throw err;
    }
};

// ── Firestore helpers ──────────────────────────────────────────────────────────

/**
 * A number the clerk typed, or null for "give me the next one".
 * Anything that is not a positive whole number is rejected rather than
 * quietly coerced — an LR number is an identity, not an amount.
 */
const readRequestedLrNo = (value, strictFourDigit = false) => {
    if (value === undefined || value === null || value === '') return null;
    const reject = () => {
        const e = new Error('LR number must be a 4-digit number (1000 - 9999)');
        e.status = 400;
        throw e;
    };
    // Digits only
    const raw = typeof value === 'number' ? String(value) : String(value).trim();
    if (!/^\d+$/.test(raw)) reject();
    const n = parseInt(raw, 10);
    if (!Number.isSafeInteger(n)) reject();
    // Historical Jharli/test imports can carry six-digit LR numbers; keep
    // their behavior while the three godown books enforce four digits.
    if (n < 1000 || (strictFourDigit ? n > 9999 : n > 9999 && n < 100000)) reject();
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
            const start = requested || 1001;
            transaction.set(metadataRef, { count: start, available: [] });
            return start;
        }
        const data = doc.data();
        let available = (data.available || []).filter(n => n >= 1000 && n <= 9999);

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
        let currentCount = data.count || 0;
        if (currentCount < 1000 || currentCount > 9999) currentCount = 1000;
        const newCount = currentCount + 1;
        transaction.update(metadataRef, { count: newCount });
        return newCount;
    });
};

// Dump-godown books issue one LR per material. Reserve the whole group in one
// transaction, so concurrent clerks cannot claim the same number. Existing
// books seed the counter; deleted numbers are not reused in these books.
const firestoreGetNextLrNos = async (orgId, lrCollection, metadataCollection, requested, count) => {
    const metadata = db.collection(metadataCollection);
    const counterRef = metadata.doc(`${orgId}_lr_counter`);
    return db.runTransaction(async transaction => {
        const counter = await transaction.get(counterRef);
        const existing = await transaction.get(db.collection(lrCollection).where('orgId', '==', orgId));
        const taken = new Set(existing.docs.map(doc => Number(doc.data().lrNo)).filter(Number.isSafeInteger));
        const fourDigitTaken = [...taken].filter(n => n >= 1000 && n <= 9999);
        const maxExisting = fourDigitTaken.reduce((max, number) => Math.max(max, number), 1000);
        let oldCount = counter.exists ? Number(counter.data().count) || 0 : 1000;
        if (oldCount > 9999 || oldCount < 1000) oldCount = 1000;
        if (requested !== null && taken.has(requested)) {
            const error = new Error(`LR #${requested} already exists in this book`); error.status = 409; throw error;
        }
        const numbers = [];
        let next = Math.max(oldCount, maxExisting);
        if (next < 1000 || next > 9999) next = 1000;
        if (requested !== null) { numbers.push(requested); next = Math.max(next, requested); }
        if (count > 9000) { const error = new Error('Four-digit LR series is full'); error.status = 409; throw error; }
        let attempts = 0;
        while (numbers.length < count) {
            next++;
            if (next > 9999) next = 1001;
            while (taken.has(next) || numbers.includes(next)) {
                next++;
                if (next > 9999) next = 1001;
                if (++attempts > 9000) { const error = new Error('Four-digit LR series is full'); error.status = 409; throw error; }
            }
            numbers.push(next);
        }
        const claimRefs = numbers.map(number => metadata.doc(`${orgId}_lr_claim_${number}`));
        const claims = await Promise.all(claimRefs.map(ref => transaction.get(ref)));
        if (claims.some(claim => claim.exists)) {
            const error = new Error('An LR number was already reserved; retry creation'); error.status = 409; throw error;
        }
        transaction.set(counterRef, { count: Math.max(oldCount, next), available: [] }, { merge: true });
        claimRefs.forEach((ref, index) => transaction.set(ref, { number: numbers[index], orgId, lrCollection }));
        return numbers;
    });
};

function getTodayDateString(dateVal) {
    if (dateVal) {
        try {
            const d = new Date(dateVal);
            if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
        } catch (_) {}
    }
    return new Date().toISOString().slice(0, 10);
}

async function getNextDailyLoadingNo(orgId, lrCollection, dateVal) {
    const todayStr = getTodayDateString(dateVal);
    const counterDocId = `daily_loading_${todayStr}`;
    
    if (firebaseAvailable()) {
        const ref = db.collection('metadata').doc(`${orgId}_${lrCollection}_${counterDocId}`);
        return await db.runTransaction(async (transaction) => {
            const doc = await transaction.get(ref);
            const current = (doc.exists && doc.data().count) || 0;
            const next = current + 1;
            transaction.set(ref, { count: next, date: todayStr, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
            return next;
        });
    } else {
        const counterKey = `${orgId}_${lrCollection}_${counterDocId}`;
        return localStore.getCounter(counterKey);
    }
}

const firestoreCreate = async (orgId, data, lrCollection = COLLECTION_LR, metadataCollection = COLLECTION_METADATA) => {
    const { materials, date, truckNo, partyName, billing, destination, note, voiceMessageBase64, partyId, createdBy, createdByName, source } = data;
    const group = groupOfLrCollection(lrCollection);
    const location = locationOfLrCollection(lrCollection);
    const partyScope = partyScopeForLrCollection(lrCollection);
    const normalizedPartyName = normalizePartyName(partyName || '');

    const billType = billTypeForCollection(lrCollection);
    const requestedNo = readRequestedLrNo(data.lrNo, !!billType);
    if (!billType && requestedNo !== null && await lrNoTaken(orgId, lrCollection, requestedNo)) {
        { const e = new Error(`LR #${requestedNo} already exists in this book`); e.status = 409; throw e; }
    }
    const lrNos = billType
        ? await firestoreGetNextLrNos(orgId, lrCollection, metadataCollection, requestedNo, materials.length)
        : [await firestoreGetNextLrNo(orgId, metadataCollection, requestedNo)];
    const lrNo = lrNos[0];
    const loadingNo = await getNextDailyLoadingNo(orgId, lrCollection, date);
    const batch = db.batch();
    const createdIds = [];
    
    const entryId = billType
        ? await getNextSixDigitEntryId(orgId, lrCollection, metadataCollection)
        : await getNextEntryId(orgId, lrCollection);
    const voucherCollection = billType ? voucherCollectionForLr(lrCollection) : null;
    const existing = billType ? (await db.collection(voucherCollection).where('orgId', '==', orgId).get()).docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(v => v.type === billType) : [];
    const prior = existing.find(v => billLrNumbers(v).some(number => lrNos.some(lr => String(lr) === number)));
    const trimmedBillNo = String(data.billNo || '').trim();
    if (billType && !prior && trimmedBillNo && existing.some(v => String(v.billNo || '').trim() === trimmedBillNo)) {
        const error = new Error(`Bill #${trimmedBillNo} already exists`); error.status = 409; throw error;
    }
    const finalPartyId = await syncParty(orgId, normalizedPartyName, group, location, data.partyCode, partyId, partyScope);
    // We must handle async in map/forEach carefully. Since syncParty might be needed for material-level parties:
    for (const [index, mat] of materials.entries()) {
        const matPartyName = normalizePartyName(mat.partyName || normalizedPartyName);
        const matPartyId = matPartyName === normalizedPartyName && !mat.partyId && !mat.partyCode
            ? finalPartyId
            : await syncParty(orgId, matPartyName, group, location, mat.partyCode || (matPartyName === normalizedPartyName ? data.partyCode : ''), mat.partyId, partyScope);

        const ref = db.collection(lrCollection).doc();
        batch.set(ref, {
            entryId,
            lrNo: billType ? lrNos[index] : lrNo,
            loadingNo,
            dailyTokenNo: loadingNo,
            date: date || new Date().toISOString(),
            truckNo: truckNo || '',
            source: source || data.loadingPoint || '',
            destination: billType ? (mat.destination || destination || '') : (destination || ''),
            material: mat.type, 
            loadingType: mat.loadingType || data.loadingType || 'From Godown',
            weight: parseFloat(mat.weight) || 0,
            totalBags: parseInt(mat.bags) || 0, 
            billing: mat.billing || billing || 'No',
            partyName: matPartyName,
            ...(billType ? { partyCode: String(mat.partyCode || (matPartyName === normalizedPartyName ? data.partyCode : '') || '').trim() } : {}),
            ...(billType ? { billNo: String(data.billNo || '').trim() } : {}),
            partyId: matPartyId || null,
            status: 'Created',
            note: note || '',
            voiceMessageBase64: voiceMessageBase64 || '',
            orgId,
            createdBy: createdBy || '',
            createdByName: createdByName || '',
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
        createdIds.push(ref.id);
    }
    let billId = null;
    if (billType) {
        if (prior) {
            billId = prior.id;
            const voucherRef = db.collection(voucherCollection).doc(prior.id);
            batch.update(voucherRef, {
                entryId,
                lrEntryId: entryId,
                sourceLrId: createdIds[0],
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
        } else {
            const voucherRef = db.collection(voucherCollection).doc(createdIds[0]);
            const bill = await buildBillFromLr(orgId, data, { lrNo, lrNos, entryId, sourceLrId: createdIds[0], type: billType });
            batch.set(voucherRef, { ...bill, createdAt: admin.firestore.FieldValue.serverTimestamp() });
            billId = voucherRef.id;
        }
    }
    await batch.commit();
    return { lrNo, lrNos, entryId, loadingNo, ids: createdIds, ...(billId ? { billId } : {}) };
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
    let n = localStore.getCounter(`${orgId}_${collectionName}`, 1000);
    if (n < 1000 || n > 9999) n = 1001;
    if (requested === null) return n;
    while (n < requested && n < 9999) n = localStore.getCounter(`${orgId}_${collectionName}`, 1000);
    return requested;
};

const localCreate = async (orgId, data, lrCollection = COLLECTION_LR, counterCollection = 'lr_no') => {
    const { materials, date, truckNo, partyName, billing, destination, note, voiceMessageBase64, partyId, createdBy, createdByName, source } = data;
    const group = groupOfLrCollection(lrCollection);
    const location = locationOfLrCollection(lrCollection);
    const partyScope = partyScopeForLrCollection(lrCollection);
    const normalizedPartyName = normalizePartyName(partyName || '');

    const billType = billTypeForCollection(lrCollection);
    const requestedNo = readRequestedLrNo(data.lrNo, !!billType);
    if (requestedNo !== null && await lrNoTaken(orgId, lrCollection, requestedNo)) {
        { const e = new Error(`LR #${requestedNo} already exists in this book`); e.status = 409; throw e; }
    }
    const lrNos = [localGetNextLrNo(orgId, counterCollection, requestedNo)];
    if (billType) {
        while (await lrNoTaken(orgId, lrCollection, lrNos[0])) {
            if (requestedNo !== null) { const error = new Error(`LR #${requestedNo} already exists in this book`); error.status = 409; throw error; }
            lrNos[0] = localGetNextLrNo(orgId, counterCollection);
        }
        while (lrNos.length < materials.length) {
            const next = localGetNextLrNo(orgId, counterCollection);
            if (!lrNos.includes(next) && !(await lrNoTaken(orgId, lrCollection, next))) lrNos.push(next);
        }
    }
    const lrNo = lrNos[0];
    const loadingNo = await getNextDailyLoadingNo(orgId, lrCollection, date);
    const createdIds = [];

    const entryId = billType
        ? await getNextSixDigitEntryId(orgId, lrCollection)
        : await getNextEntryId(orgId, lrCollection);
    const voucherCollection = voucherCollectionForLr(lrCollection);
    const existingBills = billType ? localStore.getAll(voucherCollection).filter(v => v.orgId === orgId && v.type === billType) : [];
    const priorBill = existingBills.find(v => billLrNumbers(v).some(number => lrNos.some(lr => String(lr) === number)));
    let bill = null;
    if (!priorBill && billType) {
        const localTrimmedBillNo = String(data.billNo || '').trim();
        if (localTrimmedBillNo) {
            const billNumberUsed = existingBills.find(v => String(v.billNo || '').trim() === localTrimmedBillNo);
            if (billNumberUsed) { const error = new Error(`Bill #${localTrimmedBillNo} already exists`); error.status = 409; throw error; }
        }
        bill = await buildBillFromLr(orgId, data, { lrNo, lrNos, entryId, sourceLrId: null, type: billType });
    }
    const finalPartyId = await syncParty(orgId, normalizedPartyName, group, location, data.partyCode, partyId, partyScope);
    for (const [index, mat] of materials.entries()) {
        const matPartyName = normalizePartyName(mat.partyName || normalizedPartyName);
        const matPartyId = matPartyName === normalizedPartyName && !mat.partyId && !mat.partyCode
            ? finalPartyId
            : await syncParty(orgId, matPartyName, group, location, mat.partyCode || (matPartyName === normalizedPartyName ? data.partyCode : ''), mat.partyId, partyScope);

        const doc = localStore.insert(lrCollection, {
            entryId,
            lrNo: billType ? lrNos[index] : lrNo,
            loadingNo,
            dailyTokenNo: loadingNo,
            date: date || new Date().toISOString().split('T')[0],
            truckNo,
            source: source || data.loadingPoint || '',
            destination: billType ? (mat.destination || destination || '') : (destination || ''),
            material: mat.type,
            loadingType: mat.loadingType || data.loadingType || 'From Godown',
            weight: parseFloat(mat.weight) || 0,
            totalBags: parseInt(mat.bags) || 0, 
            billing: mat.billing || billing || 'No',
            partyName: matPartyName,
            ...(billType ? { partyCode: String(mat.partyCode || (matPartyName === normalizedPartyName ? data.partyCode : '') || '').trim() } : {}),
            ...(billType ? { billNo: String(data.billNo || '').trim() } : {}),
            partyId: matPartyId || null,
            status: 'Created',
            note: note || '',
            voiceMessageBase64: voiceMessageBase64 || '',
            orgId,
            createdBy: createdBy || '',
            createdByName: createdByName || ''
        });
        createdIds.push(doc.id);
    }
    let billId = null;
    if (priorBill) {
        billId = priorBill.id;
        localStore.update(voucherCollection, priorBill.id, {
            entryId,
            lrEntryId: entryId,
            sourceLrId: createdIds[0],
        });
    } else if (bill) {
        billId = createdIds[0];
        localStore.insert(voucherCollection, { ...bill, id: billId, sourceLrId: billId });
    }
    return { lrNo, lrNos, entryId, loadingNo, ids: createdIds, ...(billId ? { billId } : {}) };
};

const localGetAll = (orgId, lrCollection = COLLECTION_LR) => {
    return localStore.getAll(lrCollection)
        .filter(r => r.orgId === orgId)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
};

// ── Public API — auto-selects Firebase or local ────────────────────────────────

const createLoadingReceipt = async (
    orgId,
    data,
    lrCollection = COLLECTION_LR,
    counterCollection = COLLECTION_METADATA,
    vehicleCollection = 'vehicles'
) => {
    validateLrMaterials(data?.materials);
    if (billTypeForCollection(lrCollection)) validateBillDetails(data, { required: true });
    if (data && data.truckNo) {
        try {
            const vehicleService = require('./vehicleService');
            await vehicleService.ensureOrUpdateVehicleContacts(orgId, {
                truckNo: data.truckNo,
                driverName: data.driverName,
                driverContact: data.driverContact,
                ownerName: data.ownerName,
                ownerContact: data.ownerContact,
                ownershipType: data.ownershipType,
                marketLocation: lrCollection.includes('bahadurgarh_') ? 'bahadurgarh'
                    : lrCollection.includes('jhajjar_') ? 'jhajjar'
                        : lrCollection.includes('kosli_') ? 'kosli'
                            : 'jharli'
            }, vehicleCollection);
        } catch (vehErr) {
            console.error('Error auto-updating vehicle contacts from LR create:', vehErr.message);
        }
    }
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

/** Rebuild one bill from every material LR in the selected load. */
const billDataFromReceipts = (receipts, details = {}) => {
    const first = receipts[0];
    const data = {
        ...first,
        billNo: String(details.billNo || first.billNo || '').trim(),
        partyCode: String(details.partyCode || first.partyCode || '').trim(),
        materials: receipts.map(row => ({
            type: row.material || row.type || '',
            loadingType: row.loadingType || '',
            bags: Number(row.totalBags ?? row.bags ?? 0),
            weight: Number(row.weight || 0),
            destination: row.destination || '',
            partyName: row.partyName || '',
            partyCode: String(row.partyCode || details.partyCode || first.partyCode || '').trim(),
        })),
    };
    validateBillDetails(data, { required: true });
    return data;
};

const billConflict = message => { const error = new Error(message); error.status = 409; throw error; };
const billNotFound = () => { const error = new Error('Loading receipt not found in this godown'); error.status = 404; throw error; };

/**
 * Repair an LR group whose automatic bill did not persist. Never trusts an
 * entryId or godown sent by the caller: both come from the scoped LR document.
 * Firestore transaction and deterministic voucher ID make retries idempotent.
 */
const createBillForLoadingReceipt = async (orgId, receiptId, details = {}, lrCollection = COLLECTION_LR) => {
    const billType = billTypeForCollection(lrCollection);
    if (!billType) { const error = new Error('Bill recovery is only available for the three godowns'); error.status = 400; throw error; }
    const voucherCollection = voucherCollectionForLr(lrCollection);
    const asGroup = (selected, all) => {
        const group = selected.entryId === undefined || selected.entryId === null || selected.entryId === ''
            ? [selected]
            : all.filter(row => String(row.entryId) === String(selected.entryId));
        return group.sort((a, b) => Number(a.lrNo) - Number(b.lrNo));
    };
    const checkExisting = (bills, receipts, data) => {
        const numbers = new Set(receipts.map(row => String(row.lrNo)));
        const overlapping = bills.filter(bill => bill.type === billType && billLrNumbers(bill).some(number => numbers.has(number)));
        if (overlapping.length) {
            if (overlapping.length === 1 && [...numbers].every(number => billLrNumbers(overlapping[0]).includes(number))) {
                return overlapping[0];
            }
            billConflict('Some LRs in this load already have a different bill');
        }
        if (bills.some(bill => bill.type === billType && String(bill.billNo || '').trim() === data.billNo)) {
            billConflict(`Bill #${data.billNo} already exists`);
        }
        return null;
    };

    if (firebaseAvailable()) {
        return db.runTransaction(async transaction => {
            const selectedSnap = await transaction.get(db.collection(lrCollection).doc(receiptId));
            if (!selectedSnap.exists || selectedSnap.data().orgId !== orgId) billNotFound();
            const allSnap = await transaction.get(db.collection(lrCollection).where('orgId', '==', orgId));
            const all = allSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            const selected = { id: selectedSnap.id, ...selectedSnap.data() };
            const receipts = asGroup(selected, all);
            const data = billDataFromReceipts(receipts, details);
            const voucherSnap = await transaction.get(db.collection(voucherCollection).where('orgId', '==', orgId));
            const bills = voucherSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            const existing = checkExisting(bills, receipts, data);
            if (existing) return { billId: existing.id, entryId: selected.entryId, lrNos: receipts.map(row => row.lrNo), created: false };
            const voucherRef = db.collection(voucherCollection).doc(receipts[0].id);
            const fixedIdSnap = await transaction.get(voucherRef);
            if (fixedIdSnap.exists) billConflict('Bill ID already belongs to another record');
            const bill = await buildBillFromLr(orgId, data, {
                lrNo: receipts[0].lrNo,
                lrNos: receipts.map(row => row.lrNo),
                entryId: selected.entryId,
                sourceLrId: receipts[0].id,
                type: billType,
            });
            transaction.create(voucherRef, { ...bill, createdAt: admin.firestore.FieldValue.serverTimestamp() });
            for (const receipt of receipts) {
                transaction.update(db.collection(lrCollection).doc(receipt.id), { billNo: data.billNo, partyCode: receipt.partyCode || data.partyCode });
            }
            return { billId: voucherRef.id, entryId: selected.entryId, lrNos: receipts.map(row => row.lrNo), created: true };
        });
    }

    const selected = localStore.getById(lrCollection, receiptId);
    if (!selected || selected.orgId !== orgId) billNotFound();
    const all = localStore.getAll(lrCollection).filter(row => row.orgId === orgId);
    const receipts = asGroup(selected, all);
    const data = billDataFromReceipts(receipts, details);
    const bills = localStore.getAll(voucherCollection).filter(bill => bill.orgId === orgId);
    const existing = checkExisting(bills, receipts, data);
    if (existing) return { billId: existing.id, entryId: selected.entryId, lrNos: receipts.map(row => row.lrNo), created: false };
    if (bills.some(bill => bill.id === receipts[0].id)) billConflict('Bill ID already belongs to another record');
    const bill = await buildBillFromLr(orgId, data, {
        lrNo: receipts[0].lrNo,
        lrNos: receipts.map(row => row.lrNo),
        entryId: selected.entryId,
        sourceLrId: receipts[0].id,
        type: billType,
    });
    const saved = localStore.insert(voucherCollection, { ...bill, id: receipts[0].id });
    for (const receipt of receipts) {
        localStore.update(lrCollection, receipt.id, { billNo: data.billNo, partyCode: receipt.partyCode || data.partyCode });
    }
    return { billId: saved.id, entryId: selected.entryId, lrNos: receipts.map(row => row.lrNo), created: true };
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
        const wanted = readRequestedLrNo(data.lrNo);
        if (wanted === null) { const e = new Error('LR number cannot be blank'); e.status = 400; throw e; }
        const current = firebaseAvailable()
            ? (await db.collection(lrCollection).doc(id).get()).data()
            : localStore.getById(lrCollection, id);
        if (current && current.lrNo !== wanted) {
            const orgId = current.orgId;
            if (await lrNoTaken(orgId, lrCollection, wanted)) {
                const e = new Error(`LR #${wanted} already exists in this book`); e.status = 409; throw e;
            }
            if (billTypeForCollection(lrCollection)) {
                const voucherCollection = voucherCollectionForLr(lrCollection);
                const linked = firebaseAvailable()
                    ? (await db.collection(voucherCollection).where('orgId', '==', orgId).get()).docs.some(doc => doc.data().type === billTypeForCollection(lrCollection) && billLrNumbers(doc.data()).includes(String(current.lrNo)))
                    : localStore.getAll(voucherCollection).some(v => v.orgId === orgId && v.type === billTypeForCollection(lrCollection) && billLrNumbers(v).includes(String(current.lrNo)));
                if (linked) { const error = new Error('Delete linked bill before changing LR number'); error.status = 409; throw error; }
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
    const billType = billTypeForCollection(lrCollection);
    if (billType) {
        const receipt = firebaseAvailable()
            ? (await db.collection(lrCollection).doc(id).get()).data()
            : localStore.getById(lrCollection, id);
        if (receipt) {
            const voucherCollection = voucherCollectionForLr(lrCollection);
            const linked = firebaseAvailable()
                ? (await db.collection(voucherCollection).where('orgId', '==', receipt.orgId).get()).docs.some(doc => doc.data().type === billType && billLrNumbers(doc.data()).includes(String(receipt.lrNo)))
                : localStore.getAll(voucherCollection).some(v => v.orgId === receipt.orgId && v.type === billType && billLrNumbers(v).includes(String(receipt.lrNo)));
            if (linked) { const error = new Error('Delete linked bill before deleting loading receipt'); error.status = 409; throw error; }
        }
    }
    if (firebaseAvailable()) {
        const lrRef = db.collection(lrCollection).doc(id);
        const doc = await lrRef.get();
        if (doc.exists) {
            const { lrNo } = doc.data();
            await lrRef.delete();
            // Check if any other docs have this lrNo
            const otherDocs = await db.collection(lrCollection).where('lrNo', '==', lrNo).limit(1).get();
            if (otherDocs.empty) {
                // If no more docs with this lrNo, make it available for reuse (if valid 4-digit number)
                const num = Number(lrNo);
                if (num >= 1000 && num <= 9999) {
                    const metadataRef = db.collection(metadataCollection).doc(`${orgId || 'vgtc'}_lr_counter`);
                    await db.runTransaction(async (transaction) => {
                        const mDoc = await transaction.get(metadataRef);
                        if (mDoc.exists) {
                            const data = mDoc.data();
                            const available = (data.available || []).filter(n => n >= 1000 && n <= 9999);
                            if (!available.includes(num)) {
                                available.push(num);
                                transaction.update(metadataRef, { available });
                            }
                        } else {
                            transaction.set(metadataRef, { count: 1000, available: [num] });
                        }
                    });
                }
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
    validateLrMaterials,
    createLoadingReceipt,
    createBillForLoadingReceipt,
    getAllLoadingReceipts,
    updateBillingStatus,
    updateLoadingReceipt,
    deleteLoadingReceipt,
    generateBulkInvoice,
    getNextDailyLoadingNo,
};
