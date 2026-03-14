const bcrypt = require('bcryptjs');
const localStore = require('./localStore');
const { db, isAvailable } = require('../firebase');
const COLLECTION = 'users';

const isFirebaseAvailable = () => isAvailable();

// Seed a default admin on first run (Local or Firestore)
const seed = async () => {
    try {
        if (isFirebaseAvailable()) {
            const snapshot = await db.collection(COLLECTION).limit(1).get();
            if (snapshot.empty) {
                const hash = bcrypt.hashSync('admin123', 10);
                await db.collection(COLLECTION).add({
                    name: 'Vikas Admin',
                    username: 'admin',
                    password: hash,
                    role: 'admin',
                    createdAt: new Date().toISOString()
                });
                console.log('[Auth] Default admin created in Firestore → admin/admin123');
            }
        } else {
            const all = localStore.getAll(COLLECTION);
            if (all.length === 0) {
                const hash = bcrypt.hashSync('admin123', 10);
                localStore.insert(COLLECTION, {
                    name: 'Vikas Admin',
                    username: 'admin',
                    password: hash,
                    role: 'admin',
                });
                console.log('[Auth] Default admin created locally → admin/admin123');
            }
        }
    } catch (err) {
        console.error('[Auth] Seed failed:', err.message);
    }
};
seed();

const getAll = async () => {
    if (isFirebaseAvailable()) {
        const snapshot = await db.collection(COLLECTION).get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), password: undefined }));
    }
    return localStore.getAll(COLLECTION).map(u => ({ ...u, password: undefined }));
};

const findByUsername = async (username) => {
    if (isFirebaseAvailable()) {
        const snapshot = await db.collection(COLLECTION).where('username', '==', username).limit(1).get();
        if (snapshot.empty) return null;
        const doc = snapshot.docs[0];
        return { id: doc.id, ...doc.data() };
    }
    return localStore.getAll(COLLECTION).find(u => u.username === username);
};

const createUser = async (name, username, password, role = 'user') => {
    const existing = await findByUsername(username);
    if (existing) throw new Error('Username already exists');
    const hash = bcrypt.hashSync(password, 10);

    if (isFirebaseAvailable()) {
        const docRef = await db.collection(COLLECTION).add({
            name, username, password: hash, role,
            createdAt: new Date().toISOString()
        });
        return { id: docRef.id, name, username, role };
    }

    const doc = localStore.insert(COLLECTION, { name, username, password: hash, role });
    return { ...doc, password: undefined };
};

const deleteUser = async (id) => {
    if (isFirebaseAvailable()) {
        const usersRef = db.collection(COLLECTION);
        const userDoc = await usersRef.doc(id).get();
        if (!userDoc.exists) throw new Error('User not found');
        const userData = userDoc.data();
        if (userData.role === 'admin') {
            const adminSnapshot = await usersRef.where('role', '==', 'admin').get();
            if (adminSnapshot.size <= 1) throw new Error('Cannot delete the last admin');
        }
        await usersRef.doc(id).delete();
        return;
    }

    const user = localStore.getAll(COLLECTION).find(u => u.id === id);
    if (!user) throw new Error('User not found');
    if (user.role === 'admin' && localStore.getAll(COLLECTION).filter(u => u.role === 'admin').length === 1)
        throw new Error('Cannot delete the last admin');
    localStore.delete(COLLECTION, id);
};

const verifyPassword = (plain, hash) => bcrypt.compareSync(plain, hash);

module.exports = { getAll, findByUsername, createUser, deleteUser, verifyPassword };
