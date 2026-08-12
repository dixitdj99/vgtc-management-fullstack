const localStore = require('../utils/localStore');
const { db, admin, isAvailable } = require('../firebase');
const crypto = require('crypto');
const uuidv4 = () => crypto.randomUUID();

const firebaseAvailable = () => isAvailable();
const COLLECTION_DESTINATIONS = 'destinations';

/**
 * Normalizes destination data.
 */
const normalizeDestination = (data = {}) => {
    const name = String(data.name || '').trim().toUpperCase();
    const rateHistory = Array.isArray(data.rateHistory) ? data.rateHistory : [];
    
    // Sort rate history by startDate asc
    rateHistory.sort((a, b) => String(a.startDate || '').localeCompare(String(b.startDate || '')));

    let currentRate = Number(data.currentRate);
    if (isNaN(currentRate) || currentRate <= 0) {
        if (rateHistory.length > 0) {
            currentRate = Number(rateHistory[rateHistory.length - 1].rate) || 0;
        } else {
            currentRate = 0;
        }
    }

    return {
        ...data,
        name,
        currentRate,
        rateHistory,
    };
};

/**
 * Find effective rate for a specific date from rate history.
 */
const lookupRateForDate = (rateHistory = [], currentRate = 0, dateStr = '') => {
    if (!dateStr) return currentRate;
    if (!Array.isArray(rateHistory) || rateHistory.length === 0) return currentRate;

    const targetDate = dateStr.slice(0, 10); // 'YYYY-MM-DD'

    // 1. Check exact date range matches
    for (const period of rateHistory) {
        const start = (period.startDate || '').slice(0, 10);
        const end = (period.endDate || '').slice(0, 10);
        if (start && targetDate >= start) {
            if (!end || targetDate <= end) {
                return Number(period.rate) || 0;
            }
        }
    }

    // 2. Fallback: Find the latest rate period starting on or before targetDate
    const sorted = [...rateHistory].sort((a, b) => String(a.startDate || '').localeCompare(String(b.startDate || '')));
    let lastValidRate = null;
    for (const period of sorted) {
        const start = (period.startDate || '').slice(0, 10);
        if (start && targetDate >= start) {
            lastValidRate = Number(period.rate);
        }
    }

    if (lastValidRate !== null && !isNaN(lastValidRate)) {
        return lastValidRate;
    }

    // 3. Fallback to currentRate or first available rate
    return currentRate || Number(sorted[0]?.rate) || 0;
};

// ── Firestore CRUD ─────────────────────────────────────────────────────────────

const firestoreGetAll = async (orgId) => {
    const snapshot = await db.collection(COLLECTION_DESTINATIONS)
        .where('orgId', '==', orgId)
        .get();
    const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    return docs.map(normalizeDestination).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
};

const firestoreCreate = async (orgId, payload) => {
    const ref = db.collection(COLLECTION_DESTINATIONS).doc();
    const data = {
        ...payload,
        orgId,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    await ref.set(data);
    return { id: ref.id, ...payload, orgId };
};

const firestoreUpdate = async (id, patch) => {
    await db.collection(COLLECTION_DESTINATIONS).doc(id).update({
        ...patch,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
};

const firestoreDelete = async (id) => {
    await db.collection(COLLECTION_DESTINATIONS).doc(id).delete();
};

// ── LocalStore CRUD ────────────────────────────────────────────────────────────

const localGetAll = (orgId) => {
    return localStore.getAll(COLLECTION_DESTINATIONS)
        .filter(d => d.orgId === orgId)
        .map(normalizeDestination)
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
};

const localCreate = (orgId, payload) => {
    const doc = localStore.insert(COLLECTION_DESTINATIONS, { ...payload, orgId });
    return normalizeDestination(doc);
};

const localUpdate = (id, patch) => {
    return localStore.update(COLLECTION_DESTINATIONS, id, patch);
};

const localDelete = (id) => {
    return localStore.delete(COLLECTION_DESTINATIONS, id);
};

// ── Public Service API ─────────────────────────────────────────────────────────

const getAllDestinations = async (orgId, { autoSync = false } = {}) => {
    let list = [];
    if (firebaseAvailable()) list = await firestoreGetAll(orgId);
    else list = localGetAll(orgId);

    if (autoSync && list.length === 0) {
        await syncDestinationsFromVouchers(orgId);
        if (firebaseAvailable()) list = await firestoreGetAll(orgId);
        else list = localGetAll(orgId);
    }

    return list;
};

const getDestinationById = async (orgId, id) => {
    const all = await getAllDestinations(orgId, { autoSync: false });
    return all.find(d => d.id === id) || null;
};

const createDestination = async (orgId, data) => {
    const name = String(data.name || '').trim().toUpperCase();
    if (!name) throw new Error('Destination name is required');

    const all = await getAllDestinations(orgId, { autoSync: false });
    if (all.some(d => d.name === name)) {
        throw new Error(`Destination "${name}" already exists`);
    }

    const rate = Number(data.rate) || 0;
    const startDate = data.startDate || new Date().toISOString().split('T')[0];
    const endDate = data.endDate || null;

    const rateHistory = Array.isArray(data.rateHistory) && data.rateHistory.length > 0
        ? data.rateHistory
        : [{ id: uuidv4(), rate, startDate, endDate }];

    const payload = normalizeDestination({
        name,
        currentRate: rate,
        rateHistory,
    });

    if (firebaseAvailable()) return await firestoreCreate(orgId, payload);
    return localCreate(orgId, payload);
};

const updateDestination = async (orgId, id, data) => {
    const existing = await getDestinationById(orgId, id);
    if (!existing) throw new Error('Destination not found');

    const name = data.name ? String(data.name).trim().toUpperCase() : existing.name;
    let rateHistory = Array.isArray(data.rateHistory) ? data.rateHistory : existing.rateHistory;

    const payload = normalizeDestination({
        ...existing,
        ...data,
        name,
        rateHistory,
    });

    if (firebaseAvailable()) await firestoreUpdate(id, payload);
    else localUpdate(id, payload);

    return payload;
};

const addRatePeriod = async (orgId, id, { rate, startDate, endDate }) => {
    const existing = await getDestinationById(orgId, id);
    if (!existing) throw new Error('Destination not found');

    const newRate = Number(rate);
    if (isNaN(newRate)) throw new Error('Valid rate is required');
    const newStart = startDate || new Date().toISOString().split('T')[0];
    const newEnd = endDate || null;

    let rateHistory = [...(existing.rateHistory || [])];

    // Close any previous open-ended rate period starting before newStart
    rateHistory = rateHistory.map(period => {
        if (!period.endDate && period.startDate && period.startDate < newStart) {
            // Set endDate to 1 day before newStart
            const d = new Date(newStart);
            d.setDate(d.getDate() - 1);
            const prevEnd = d.toISOString().split('T')[0];
            return { ...period, endDate: prevEnd };
        }
        return period;
    });

    rateHistory.push({
        id: uuidv4(),
        rate: newRate,
        startDate: newStart,
        endDate: newEnd
    });

    const updated = normalizeDestination({
        ...existing,
        currentRate: newRate,
        rateHistory
    });

    if (firebaseAvailable()) await firestoreUpdate(id, updated);
    else localUpdate(id, updated);

    return updated;
};

const deleteDestination = async (id) => {
    if (firebaseAvailable()) await firestoreDelete(id);
    else localDelete(id);
    return { success: true };
};

const getRateForDate = async (orgId, name, dateStr) => {
    if (!name) return 0;
    const cleanName = String(name).trim().toUpperCase();
    const all = await getAllDestinations(orgId, { autoSync: false });
    const dest = all.find(d => d.name === cleanName);
    if (!dest) return 0;

    return lookupRateForDate(dest.rateHistory, dest.currentRate, dateStr);
};

const autoRecordDestination = async (orgId, { name, rate, date }) => {
    if (!name) return null;
    const cleanName = String(name).trim().toUpperCase();
    const all = await getAllDestinations(orgId, { autoSync: false });
    const existing = all.find(d => d.name === cleanName);

    if (existing) {
        return existing; // Already exists, do not overwrite list rate
    }

    // New destination: record it into master list
    const numericRate = Number(rate) || 0;
    const startDate = date || new Date().toISOString().split('T')[0];
    return await createDestination(orgId, {
        name: cleanName,
        rate: numericRate,
        startDate,
        endDate: null
    });
};

/**
 * Scans all existing vouchers and LRs for the organization, extracts unique non-empty
 * destination names with their latest rates and dates, and populates any missing
 * destination entries into the destinations master collection.
 */
const syncDestinationsFromVouchers = async (orgId) => {
    let vouchers = [];
    try {
        const voucherService = require('./voucherService');
        vouchers = await voucherService.getAllVouchers(orgId);
    } catch (err) {
        console.error('[destinationService] Failed to load vouchers for sync:', err.message);
    }

    let lrs = [];
    try {
        const lrService = require('./lrService');
        const collections = [
            'loading_receipts',
            'jkl_loading_receipts',
            'kosli_loading_receipts',
            'jhajjar_loading_receipts',
            'bahadurgarh_loading_receipts'
        ];
        for (const col of collections) {
            try {
                const list = await lrService.getAllLoadingReceipts(orgId, col);
                if (Array.isArray(list)) lrs.push(...list);
            } catch (e) {
                // ignore missing collections
            }
        }
    } catch (err) {
        console.error('[destinationService] Failed to load LRs for sync:', err.message);
    }

    const destMap = new Map();

    const processItem = (name, rate, date) => {
        if (!name || typeof name !== 'string') return;
        const cleanName = name.trim().toUpperCase();
        if (!cleanName) return;

        const numericRate = Number(rate) || 0;
        const itemDate = date || new Date().toISOString().split('T')[0];

        if (!destMap.has(cleanName)) {
            destMap.set(cleanName, { name: cleanName, rate: numericRate, date: itemDate });
        } else {
            const existing = destMap.get(cleanName);
            if ((!existing.rate && numericRate > 0) || (itemDate > existing.date && numericRate > 0)) {
                destMap.set(cleanName, { name: cleanName, rate: numericRate, date: itemDate });
            }
        }
    };

    // Extract from vouchers
    for (const v of vouchers) {
        const vDate = v.date || (v.createdAt ? new Date(v.createdAt).toISOString().split('T')[0] : '');
        if (Array.isArray(v.deliveries) && v.deliveries.length > 0) {
            for (const d of v.deliveries) {
                processItem(d.destination, d.rate, vDate);
            }
        } else if (v.destination) {
            processItem(v.destination, v.rate, vDate);
        }
    }

    // Extract from LRs
    for (const lr of lrs) {
        const lrDate = lr.date || (lr.createdAt ? new Date(lr.createdAt).toISOString().split('T')[0] : '');
        if (lr.destination) {
            processItem(lr.destination, lr.rate, lrDate);
        }
    }

    const existingDests = await getAllDestinations(orgId, { autoSync: false });
    const existingNames = new Set(existingDests.map(d => (d.name || '').trim().toUpperCase()));

    const added = [];
    for (const [cleanName, info] of destMap.entries()) {
        if (!existingNames.has(cleanName)) {
            try {
                const created = await createDestination(orgId, {
                    name: info.name,
                    rate: info.rate,
                    startDate: info.date || new Date().toISOString().split('T')[0],
                    endDate: null
                });
                added.push(created);
                existingNames.add(cleanName);
            } catch (e) {
                console.error(`[destinationService] Error syncing destination "${cleanName}":`, e.message);
            }
        }
    }

    return {
        syncedCount: added.length,
        addedDestinations: added,
        totalFoundInVouchers: destMap.size
    };
};

module.exports = {
    getAllDestinations,
    getDestinationById,
    createDestination,
    updateDestination,
    addRatePeriod,
    deleteDestination,
    getRateForDate,
    autoRecordDestination,
    lookupRateForDate,
    syncDestinationsFromVouchers,
};

