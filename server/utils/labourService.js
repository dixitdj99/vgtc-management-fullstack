const bcrypt = require('bcryptjs');
const localStore = require('./localStore');
const { db, isAvailable } = require('../firebase');
const { getEnvCol } = require('./collectionUtils');

// Labourers stored in a SEPARATE collection from main users.
// They can ONLY access the Labour Portal, NOT the main management system.
const getLabCol = () => getEnvCol('labourers');

const isFirebase = () => isAvailable();

const getAll = async () => {
    if (isFirebase()) {
        const snap = await db.collection(getLabCol()).get();
        return snap.docs.map(d => ({ id: d.id, ...d.data(), password: undefined }));
    }
    return localStore.getAll(getLabCol()).map(u => ({ ...u, password: undefined }));
};

const findByUsername = async (username) => {
    if (isFirebase()) {
        const snap = await db.collection(getLabCol()).where('username', '==', username).limit(1).get();
        if (snap.empty) return null;
        const doc = snap.docs[0];
        return { id: doc.id, ...doc.data() };
    }
    return localStore.getAll(getLabCol()).find(u => u.username === username) || null;
};

const findById = async (id) => {
    if (isFirebase()) {
        const doc = await db.collection(getLabCol()).doc(id).get();
        if (!doc.exists) return null;
        return { id: doc.id, ...doc.data() };
    }
    return localStore.getAll(getLabCol()).find(u => u.id === id) || null;
};

const create = async ({ name, username, password, godown }) => {
    if (!name || !username || !password || !godown)
        throw new Error('name, username, password, and godown are required');
    const existing = await findByUsername(username);
    if (existing) throw new Error('Username already taken');

    const hash = bcrypt.hashSync(password, 10);
    const data = {
        name,
        username,
        password: hash,
        godown, // 'kosli' | 'jhajjar' | 'jkl'
        role: 'labourer',
        createdAt: new Date().toISOString(),
    };

    if (isFirebase()) {
        const ref = await db.collection(getLabCol()).add(data);
        return { id: ref.id, ...data, password: undefined };
    }
    const doc = localStore.insert(getLabCol(), data);
    return { ...doc, password: undefined };
};

const update = async (id, { name, godown, password }) => {
    const updates = {};
    if (name) updates.name = name;
    if (godown) updates.godown = godown;
    if (password) updates.password = bcrypt.hashSync(password, 10);

    if (isFirebase()) {
        await db.collection(getLabCol()).doc(id).update(updates);
        return;
    }
    localStore.update(getLabCol(), id, updates);
};

const remove = async (id) => {
    if (isFirebase()) {
        await db.collection(getLabCol()).doc(id).delete();
        return;
    }
    localStore.delete(getLabCol(), id);
};

const verifyPassword = (plain, hash) => bcrypt.compareSync(plain, hash);

module.exports = { getAll, findByUsername, findById, create, update, remove, verifyPassword };
