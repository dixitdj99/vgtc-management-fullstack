const localStore = require('./localStore');
const { db, admin, isAvailable } = require('../firebase');

const firebaseAvailable = () => isAvailable();
const DEFAULT_COLLECTION = 'sales';
const MOVES_COLLECTION = 'sell_cash_movements';

/** An account name is only meaningful on an online payment. */
const accountFor = (paymentType, onlineAccount) =>
    paymentType === 'online' ? String(onlineAccount || '').trim() : '';

const getAll = async (orgId, collection = DEFAULT_COLLECTION) => {
    if (firebaseAvailable()) {
        const snapshot = await db.collection(collection)
            .where('orgId', '==', orgId)
            .get();
        const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        return docs.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    }
    return localStore.getAll(collection)
        .filter(e => e.orgId === orgId)
        .sort((a, b) => new Date(b.date) - new Date(a.date));
};

const addSale = async (orgId, data, collection = DEFAULT_COLLECTION) => {
    const { material, quantity, rate, date, remark, customerName, brand, paymentType, paymentStatus, stockType, onlineAccount } = data;

    if (!material || !quantity || !rate) throw new Error("Missing required fields");

    const totalAmount = parseFloat(quantity) * parseFloat(rate);

    const saleData = {
        material,
        quantity: parseInt(quantity),
        rate: parseFloat(rate),
        totalAmount,
        orgId,
        date: date || new Date().toISOString().slice(0, 10),
        remark: remark || '',
        customerName: customerName || 'Walk-in',
        brand: brand || 'dump',
        paymentType: paymentType || 'cash',
        paymentStatus: paymentStatus || 'paid',
        // Whose account the money landed in. Cleared on a cash sale so a form
        // switched from online to cash cannot leave a stale account behind.
        onlineAccount: accountFor(paymentType || 'cash', onlineAccount),
        // Which stack the bags leave. Defaults to 'good' so every sale saved
        // before set bags existed keeps counting against the good balance.
        stockType: stockType === 'set' ? 'set' : 'good',
        timestamp: Date.now()
    };
    
    let savedSale;

    if (firebaseAvailable()) {
        const ref = db.collection(collection).doc();
        await ref.set({ 
            ...saleData, 
            createdAt: admin.firestore.FieldValue.serverTimestamp() 
        });
        savedSale = { id: ref.id, ...saleData };
    } else {
        savedSale = localStore.insert(collection, saleData);
    }

    return savedSale;
};

const updateSale = async (id, data, collection = DEFAULT_COLLECTION) => {
    const patch = { ...data };
    // Marking a pending sale paid also decides the account, and switching it to
    // cash must drop whatever account was there.
    if (patch.paymentType !== undefined) {
        patch.onlineAccount = accountFor(patch.paymentType, patch.onlineAccount);
    } else if (patch.onlineAccount !== undefined) {
        patch.onlineAccount = String(patch.onlineAccount || '').trim();
    }

    if (firebaseAvailable()) {
        await db.collection(collection).doc(id).update(patch);
        return { id, ...patch };
    } else {
        return localStore.update(collection, id, patch);
    }
};

const deleteSale = async (id, brand = 'dump', collection = DEFAULT_COLLECTION) => {
    if (firebaseAvailable()) {
        await db.collection(collection).doc(id).delete();
    } else {
        localStore.delete(collection, id);
    }
};

/* ── Sell cash movements ──────────────────────────────────────────────────────
 *
 * Money leaving the sell cash box, either into the cashbook or straight out as
 * a withdrawal. Kept in its own collection so the sell side has a real balance
 * rather than a free-typed transfer amount.
 */

const MOVEMENT_TYPES = ['to_cashbook', 'withdrawal'];

const getMovements = async (orgId, brand, collection = MOVES_COLLECTION) => {
    if (!orgId) throw new Error('Missing organisation context');
    let docs;
    if (firebaseAvailable()) {
        const snap = await db.collection(collection).where('orgId', '==', orgId).get();
        docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } else {
        docs = localStore.getAll(collection).filter(e => e.orgId === orgId);
    }
    if (brand) docs = docs.filter(d => d.brand === brand);
    return docs.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
};

/**
 * Cash the sell box is holding: cash actually collected, less everything moved
 * out of it.
 *
 * Online sales are absent from this sum by construction — that is the whole
 * mechanism preventing online money from reaching the cashbook. Pending sales
 * are excluded too: the money is not in hand until it is paid.
 */
const getCashInHand = async (orgId, brand, salesCol = DEFAULT_COLLECTION, movesCol = MOVES_COLLECTION) => {
    const [sales, moves] = await Promise.all([
        getAll(orgId, salesCol),
        getMovements(orgId, brand, movesCol),
    ]);
    const collected = sales
        .filter(s => s.brand === brand && s.paymentType === 'cash' && s.paymentStatus !== 'pending')
        .reduce((sum, s) => sum + (parseFloat(s.totalAmount) || 0), 0);
    const movedOut = moves.reduce((sum, m) => sum + (parseFloat(m.amount) || 0), 0);
    return Math.round((collected - movedOut) * 100) / 100;
};

const addMovement = async (orgId, data, salesCol = DEFAULT_COLLECTION, movesCol = MOVES_COLLECTION) => {
    if (!orgId) throw new Error('Missing organisation context');
    const { type, amount, date, remark, brand, createdBy, cashbookEntryId } = data;

    if (!MOVEMENT_TYPES.includes(type)) throw new Error('Unknown movement type: ' + type);
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) throw new Error('Amount must be positive');

    const theBrand = brand || 'dump';
    const inHand = await getCashInHand(orgId, theBrand, salesCol, movesCol);
    if (amt > inHand) {
        throw new Error(
            `Only ₹${inHand.toLocaleString('en-IN')} cash is in hand from Sell — ` +
            `₹${amt.toLocaleString('en-IN')} cannot be taken out. Online payments are not cash and cannot be moved to the cashbook.`
        );
    }

    const payload = {
        orgId,
        brand: theBrand,
        type,
        amount: amt,
        date: date || new Date().toISOString().slice(0, 10),
        remark: remark || '',
        createdBy: createdBy || '',
        cashbookEntryId: cashbookEntryId || '',
    };

    if (firebaseAvailable()) {
        const ref = db.collection(movesCol).doc();
        await ref.set({ ...payload, createdAt: admin.firestore.FieldValue.serverTimestamp() });
        return { id: ref.id, ...payload };
    }
    return localStore.insert(movesCol, payload);
};

const getMovementById = async (id, movesCol = MOVES_COLLECTION) => {
    if (firebaseAvailable()) {
        const doc = await db.collection(movesCol).doc(id).get();
        return doc.exists ? { id: doc.id, ...doc.data() } : null;
    }
    return localStore.getById(movesCol, id) || null;
};

const deleteMovement = async (id, movesCol = MOVES_COLLECTION) => {
    if (firebaseAvailable()) {
        await db.collection(movesCol).doc(id).delete();
        return;
    }
    localStore.delete(movesCol, id);
};

module.exports = {
    getAll, addSale, updateSale, deleteSale,
    getMovements, getCashInHand, addMovement, getMovementById, deleteMovement,
    MOVEMENT_TYPES,
};
