const bcrypt = require('bcryptjs');
const localStore = require('./localStore');
const COLLECTION = 'users';

// Seed a default admin on first run
const seed = () => {
    const all = localStore.getAll(COLLECTION);
    if (all.length === 0) {
        const hash = bcrypt.hashSync('admin123', 10);
        localStore.insert(COLLECTION, {
            name: 'Vikas Admin',
            username: 'admin',
            password: hash,
            role: 'admin',
        });
        console.log('[Auth] Default admin created → username: admin  password: admin123');
    }
};
seed();

const getAll = () => localStore.getAll(COLLECTION).map(u => ({ ...u, password: undefined }));

const findByUsername = (username) =>
    localStore.getAll(COLLECTION).find(u => u.username === username);

const createUser = (name, username, password, role = 'user') => {
    const existing = findByUsername(username);
    if (existing) throw new Error('Username already exists');
    const hash = bcrypt.hashSync(password, 10);
    const doc = localStore.insert(COLLECTION, { name, username, password: hash, role });
    return { ...doc, password: undefined };
};

const deleteUser = (id) => {
    const user = localStore.getAll(COLLECTION).find(u => u.id === id);
    if (!user) throw new Error('User not found');
    if (user.role === 'admin' && localStore.getAll(COLLECTION).filter(u => u.role === 'admin').length === 1)
        throw new Error('Cannot delete the last admin');
    localStore.delete(COLLECTION, id);
};

const verifyPassword = (plain, hash) => bcrypt.compareSync(plain, hash);

module.exports = { getAll, findByUsername, createUser, deleteUser, verifyPassword };
