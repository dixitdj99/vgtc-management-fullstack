const localStore = require('./localStore');
const { db, isAvailable } = require('../firebase');

/**
 * Generates the next sequential 6-digit Entry ID (starting from 100001) for a given collection and orgId.
 */
const getNextEntryId = async (orgId, collectionName) => {
    let maxId = 100000;
    if (isAvailable()) {
        const snap = await db.collection(collectionName).where('orgId', '==', orgId).get();
        snap.docs.forEach(doc => {
            const data = doc.data();
            const num = parseInt(data.entryId);
            if (!isNaN(num) && num > maxId) maxId = num;
        });
    } else {
        const docs = localStore.getAll(collectionName).filter(d => d.orgId === orgId);
        docs.forEach(d => {
            const num = parseInt(d.entryId);
            if (!isNaN(num) && num > maxId) maxId = num;
        });
    }
    return maxId + 1;
};

/**
 * Backfills existing records missing an entryId in chronological order starting from 100001.
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

    let maxId = 100000;
    docs.forEach(d => {
        const num = parseInt(d.entryId);
        if (!isNaN(num) && num > maxId) maxId = num;
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

module.exports = { getNextEntryId, ensureEntryIds };
