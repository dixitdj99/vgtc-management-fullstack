const localStore = require('./localStore');
const { db, admin, isAvailable } = require('../firebase');

const firebaseAvailable = () => isAvailable();
const DEFAULT_COLLECTION = 'sales';

const getAll = async (collection = DEFAULT_COLLECTION) => {
    if (firebaseAvailable()) {
        const snapshot = await db.collection(collection).orderBy('date', 'desc').get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }
    return localStore.getAll(collection).sort((a, b) => new Date(b.date) - new Date(a.date));
};

const addSale = async (data, collection = DEFAULT_COLLECTION) => {
    const { material, quantity, rate, date, remark, customerName, brand, paymentType } = data;
    
    if (!material) throw new Error('Material type required');
    const qty = parseInt(quantity);
    if (!qty || qty <= 0) throw new Error('Quantity (bags) must be positive');
    const r = parseFloat(rate);
    if (!r || r <= 0) throw new Error('Rate must be positive');
    if (!paymentType) throw new Error('Payment type (cash/online) required');

    const totalAmount = qty * r;
    const saleDate = date || new Date().toISOString().slice(0, 10);
    
    const saleData = {
        material,
        quantity: qty,
        rate: r,
        totalAmount,
        date: saleDate,
        remark: remark || '',
        customerName: customerName || 'Cash Sale',
        brand: brand || 'dump', // dump or jkl
        paymentType: paymentType || 'cash',
        createdAt: new Date().toISOString()
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

    // ── NOTE: Removed Cashbook integration per user request ──
    // Sales now act as their own independent ledger.

    return savedSale;
};

const deleteSale = async (id, brand = 'dump', collection = DEFAULT_COLLECTION) => {
    if (firebaseAvailable()) {
        await db.collection(collection).doc(id).delete();
    } else {
        localStore.delete(collection, id);
    }
};

module.exports = { getAll, addSale, deleteSale };
