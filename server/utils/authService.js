const bcrypt = require('bcryptjs');
const localStore = require('./localStore');
const { db, isAvailable } = require('../firebase');
const { isProduction } = require('./envConfig');
const COLLECTION = 'users';

const isFirebaseAvailable = () => isAvailable();

const DEFAULT_PERMISSIONS = {
    lr: 'edit',
    voucher: 'edit',
    balance: 'edit',
    stock: 'edit',
    cashbook: 'edit',
    diesel: 'edit',
    vehicle: 'edit'
};

const DEFAULT_USER_DATA = {
    name: 'Vikas Admin',
    username: 'admin',
    role: 'admin',
    email: '',
    isOtpEnabled: false,
    isSandbox: false,
    permissions: DEFAULT_PERMISSIONS,
};

// Seed a default admin and tester on first run (Local or Firestore)
const seed = async () => {
    try {
        const seedUsers = [
            { ...DEFAULT_USER_DATA, username: 'admin', name: 'Vikas Admin', password: 'admin123', role: 'admin', isSandbox: false },
            { ...DEFAULT_USER_DATA, username: 'tester', name: 'Sandbox Tester', password: 'test123', role: 'user', isSandbox: true }
        ];

        for (const u of seedUsers) {
            const existing = await findByUsername(u.username);
            if (!existing) {
                const { password, ...rest } = u;
                const hash = bcrypt.hashSync(password, 10);
                if (isFirebaseAvailable()) {
                    await db.collection(COLLECTION).add({ ...rest, password: hash, createdAt: new Date().toISOString() });
                    console.log(`[Auth] User '${u.username}' created in Firestore`);
                } else {
                    localStore.insert(COLLECTION, { ...rest, password: hash });
                    console.log(`[Auth] User '${u.username}' created locally`);
                }
            }
        }
    } catch (err) {
        console.error('[Auth] Seed failed:', err.message);
    }
};

const getAll = async () => {
    if (isFirebaseAvailable()) {
        const snapshot = await db.collection(COLLECTION).get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), password: undefined, otpCode: undefined }));
    }
    return localStore.getAll(COLLECTION).map(u => ({ ...u, password: undefined, otpCode: undefined }));
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

const findById = async (id) => {
    if (isFirebaseAvailable()) {
        const doc = await db.collection(COLLECTION).doc(id).get();
        if (!doc.exists) return null;
        return { id: doc.id, ...doc.data() };
    }
    return localStore.getAll(COLLECTION).find(u => u.id === id);
};

const createUser = async (name, username, password, role = 'user', email = '', permissions = null) => {
    const existing = await findByUsername(username);
    if (existing) throw new Error('Username already exists');
    const hash = bcrypt.hashSync(password, 10);
    
    const userPerms = permissions || (role === 'admin' ? DEFAULT_PERMISSIONS : {});

    const userData = {
        name,
        username,
        password: hash,
        role,
        email,
        isOtpEnabled: false,
        isSandbox: false, // Default to production mode for new accounts
        permissions: userPerms,
        createdAt: new Date().toISOString()
    };

    if (isFirebaseAvailable()) {
        const docRef = await db.collection(COLLECTION).add(userData);
        return { id: docRef.id, ...userData, password: undefined };
    }

    const doc = localStore.insert(COLLECTION, userData);
    return { ...doc, password: undefined };
};

const updateUser = async (id, data) => {
    // Only allow updating specific fields to prevent security issues
    const allowedFields = ['name', 'email', 'role', 'permissions', 'isOtpEnabled', 'isSandbox', 'password', 'otpCode', 'otpExpiry'];
    const filteredData = {};
    Object.keys(data).forEach(k => {
        if (allowedFields.includes(k)) {
            if (k === 'password') {
                filteredData[k] = bcrypt.hashSync(data[k], 10);
            } else {
                filteredData[k] = data[k];
            }
        }
    });

    if (isFirebaseAvailable()) {
        await db.collection(COLLECTION).doc(id).update(filteredData);
        return;
    }
    localStore.update(COLLECTION, id, filteredData);
}

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

const generateOTP = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
};

const saveUserOTP = async (id, otp) => {
    const expiry = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 mins
    await updateUser(id, { otpCode: otp, otpExpiry: expiry });
};

const verifyOTP = async (id, code) => {
    const user = await findById(id);
    if (!user || !user.otpCode || user.otpCode !== code) return false;
    
    const expiry = new Date(user.otpExpiry);
    if (expiry < new Date()) return false;

    // Clear OTP after success
    await updateUser(id, { otpCode: null, otpExpiry: null });
    return true;
};

const verifyPassword = (plain, hash) => bcrypt.compareSync(plain, hash);

module.exports = { 
    getAll, findByUsername, findById, createUser, updateUser, deleteUser, 
    verifyPassword, generateOTP, saveUserOTP, verifyOTP 
};

// Seed default users ONLY in non-production environments.
// This prevents test accounts from being created/overwritten in the live database.
if (!isProduction()) {
    seed();
} else {
    console.log('[Auth] Production mode: skipping seed (test users will not be created).');
}
