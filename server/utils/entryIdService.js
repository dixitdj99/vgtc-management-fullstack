const localStore = require('./localStore');
const { db, isAvailable } = require('../firebase');

/**
 * Generates the next sequential 4-digit Entry ID (starting from 1001) for a given collection and orgId.
 */
const getNextEntryId = async (orgId, collectionName) => {
    let maxId = 1000;
    if (isAvailable()) {
        const snap = await db.collection(collectionName).where('orgId', '==', orgId).get();
        snap.docs.forEach(doc => {
            const data = doc.data();
            const num = parseInt(data.entryId);
            if (!isNaN(num) && num >= 1000 && num <= 9999 && num > maxId) maxId = num;
        });
    } else {
        const docs = localStore.getAll(collectionName).filter(d => d.orgId === orgId);
        docs.forEach(d => {
            const num = parseInt(d.entryId);
            if (!isNaN(num) && num >= 1000 && num <= 9999 && num > maxId) maxId = num;
        });
    }
    return maxId + 1;
};

/** Six-digit ID sequence for the three godown LR books only. */
const getNextSixDigitEntryId = async (orgId, collectionName, metadataCollection) => {
    const first = 100001;
    const last = 999999;
    if (isAvailable()) {
        const counterRef = db.collection(metadataCollection).doc(`${orgId}_lr_entry_id_counter`);
        return db.runTransaction(async transaction => {
            const counter = await transaction.get(counterRef);
            const receipts = await transaction.get(db.collection(collectionName).where('orgId', '==', orgId));
            const existingMax = receipts.docs.reduce((max, doc) => {
                const number = Number(doc.data().entryId);
                return Number.isInteger(number) && number >= first && number <= last ? Math.max(max, number) : max;
            }, first - 1);
            const next = Math.max(Number(counter.exists && counter.data().count) || first - 1, existingMax) + 1;
            if (next > last) { const error = new Error('Six-digit entry ID series is full'); error.status = 409; throw error; }
            transaction.set(counterRef, { count: next }, { merge: true });
            return next;
        });
    }
    const existingMax = localStore.getAll(collectionName).filter(row => row.orgId === orgId).reduce((max, row) => {
        const number = Number(row.entryId);
        return Number.isInteger(number) && number >= first && number <= last ? Math.max(max, number) : max;
    }, first - 1);
    if (existingMax >= last) { const error = new Error('Six-digit entry ID series is full'); error.status = 409; throw error; }
    return existingMax + 1;
};

/**
 * Backfills existing records missing an entryId in chronological order starting from 1001.
 */
const ensureEntryIds = async (orgId, collectionName) => {
    if (!orgId) return;
    let docs = [];
    if (isAvailable()) {
        const snap = await db.collection(collectionName).where('orgId', '==', orgId).get();
        docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } else {
        docs = localStore.getAll(collectionName).filter(d => d.orgId === orgId);
    }

    const missing = docs.filter(d => !d.entryId);
    if (missing.length === 0) return;

    let maxId = 1000;
    docs.forEach(d => {
        const num = parseInt(d.entryId);
        if (!isNaN(num) && num >= 1000 && num <= 9999 && num > maxId) maxId = num;
    });

    missing.sort((a, b) => {
        const da = a.date || a.createdAt || '';
        const dbTime = b.date || b.createdAt || '';
        return String(da).localeCompare(String(dbTime));
    });

    for (const item of missing) {
        maxId++;
        const nextId = maxId;
        if (isAvailable()) {
            await db.collection(collectionName).doc(item.id).update({ entryId: nextId });
        } else {
            localStore.update(collectionName, item.id, { entryId: nextId });
        }
        item.entryId = nextId;
    }
};

/**
 * Scans ALL existing records in a collection (regardless of orgId) and backfills missing entryIds.
 */
const ensureEntryIdsAll = async (collectionName) => {
    let docs = [];
    if (isAvailable()) {
        const snap = await db.collection(collectionName).get();
        docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } else {
        docs = localStore.getAll(collectionName);
    }

    const grouped = {};
    docs.forEach(d => {
        const key = d.orgId || 'default';
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(d);
    });

    let updatedCount = 0;
    for (const orgKey of Object.keys(grouped)) {
        const list = grouped[orgKey];
        const missing = list.filter(d => !d.entryId);
        if (missing.length === 0) continue;

        let maxId = 1000;
        list.forEach(d => {
            const num = parseInt(d.entryId);
            if (!isNaN(num) && num >= 1000 && num <= 9999 && num > maxId) maxId = num;
        });

        missing.sort((a, b) => {
            const da = a.date || a.createdAt || '';
            const dbTime = b.date || b.createdAt || '';
            return String(da).localeCompare(String(dbTime));
        });

        for (const item of missing) {
            maxId++;
            const nextId = maxId;
            if (isAvailable()) {
                await db.collection(collectionName).doc(item.id).update({ entryId: nextId });
            } else {
                localStore.update(collectionName, item.id, { entryId: nextId });
            }
            item.entryId = nextId;
            updatedCount++;
        }
    }
    return updatedCount;
};

module.exports = { getNextEntryId, getNextSixDigitEntryId, ensureEntryIds, ensureEntryIdsAll };
