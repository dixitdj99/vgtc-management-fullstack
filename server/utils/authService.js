const bcrypt = require('bcryptjs');
const localStore = require('./localStore');
const { db, isAvailable } = require('../firebase');
const orgService = require('../services/orgService');
const { isProduction } = require('./envConfig');
const { getEnvCol } = require('./collectionUtils');
const stytchService = require('./stytchService');

const getUCol = () => getEnvCol('users');

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
    orgId: 'vgtc',
    email: '',
    isOtpEnabled: false,
    isSandbox: false,
    permissions: DEFAULT_PERMISSIONS,
};

// Seed a default admin and tester on first run (Local or Firestore)
const seed = async () => {
    try {
        await orgService.seedDefaultOrg();
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
                    await db.collection(getUCol()).add({ ...rest, password: hash, createdAt: new Date().toISOString() });
                    console.log(`[Auth] User '${u.username}' created in Firestore`);
                } else {
                    localStore.insert(getUCol(), { ...rest, password: hash });
                    console.log(`[Auth] User '${u.username}' created locally`);
                }
            }
        }
    } catch (err) {
        console.error('[Auth] Seed failed:', err.message);
    }
};

const getAll = async (orgId) => {
    if (isFirebaseAvailable()) {
        const snapshot = await db.collection(getUCol()).where('orgId', '==', orgId).get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), password: undefined, otpCode: undefined }));
    }
    return localStore.getAll(getUCol()).filter(u => u.orgId === orgId).map(u => ({ ...u, password: undefined, otpCode: undefined }));
};

const findByUsername = async (username) => {
    if (isFirebaseAvailable()) {
        const snapshot = await db.collection(getUCol()).where('username', '==', username).limit(1).get();
        if (snapshot.empty) return null;
        const doc = snapshot.docs[0];
        return { id: doc.id, ...doc.data() };
    }
    return localStore.getAll(getUCol()).find(u => u.username === username);
};

const findByUsernameAndOrg = async (username, orgId) => {
    if (isFirebaseAvailable()) {
        const snapshot = await db.collection(getUCol()).where('username', '==', username).where('orgId', '==', orgId).limit(1).get();
        if (snapshot.empty) return null;
        const doc = snapshot.docs[0];
        return { id: doc.id, ...doc.data() };
    }
    return localStore.getAll(getUCol()).find(u => u.username === username && u.orgId === orgId) || null;
};

const findById = async (id) => {
    if (isFirebaseAvailable()) {
        const doc = await db.collection(getUCol()).doc(id).get();
        if (!doc.exists) return null;
        return { id: doc.id, ...doc.data() };
    }
    return localStore.getAll(getUCol()).find(u => u.id === id);
};

const validatePassword = (password) => {
    if (!password || password.length < 8) throw new Error('Password must be at least 8 characters');
    if (!/[A-Za-z]/.test(password)) throw new Error('Password must contain at least one letter');
    if (!/[0-9]/.test(password)) throw new Error('Password must contain at least one number');
};

const createUser = async (name, username, password, role = 'user', email = '', permissions = null, orgId = 'vgtc') => {
    const existing = await findByUsername(username);
    if (existing) throw new Error('Username already exists');
    validatePassword(password);

    if (!email) throw new Error('Email is required');
    const finalEmail = email;
    const hash = bcrypt.hashSync(password, 12); // cost 12 (stronger than default 10)

    // Call Stytch signup first (always, using finalEmail)
    let stytchUserId = null;
    try {
        const stytchRes = await stytchService.signup(finalEmail, password);
        stytchUserId = stytchRes.user_id;
    } catch (err) {
        if (err.message && err.message.toLowerCase().includes('already exists')) {
            try {
                console.log('[Auth] User already exists in Stytch, attempting password migration fallback...');
                const migrateRes = await stytchService.migratePassword(finalEmail, hash);
                stytchUserId = migrateRes.user_id;
            } catch (migErr) {
                if (migErr.message && migErr.message.toLowerCase().includes('already has a password')) {
                    try {
                        console.log('[Auth] User already has a password set on Stytch. Fetching user details...');
                        const existingUser = await stytchService.searchUserByEmail(finalEmail);
                        if (existingUser) {
                            stytchUserId = existingUser.user_id;
                        } else {
                            throw new Error('User not found on Stytch search');
                        }
                    } catch (searchErr) {
                        console.error('[Auth] Stytch search user failed:', searchErr.message);
                        throw new Error(`Stytch signup failed because user exists, has a password, and user search failed: ${searchErr.message}`);
                    }
                } else {
                    console.error('[Auth] Fallback Stytch password migration failed:', migErr.message);
                    throw new Error(`Stytch signup failed because user exists, and password migration failed: ${migErr.message}`);
                }
            }
        } else {
            console.error('[Auth] Stytch signup during user creation failed:', err.message);
            if (stytchService.isStytchConfigured()) {
                throw new Error(`Stytch signup failed: ${err.message}`);
            }
        }
    }

    const userPerms = permissions || (role === 'admin' ? DEFAULT_PERMISSIONS : {});

    const userData = {
        name,
        username,
        password: hash,
        // plainPassword intentionally NOT stored — security risk
        role,
        orgId,
        email: finalEmail,
        isOtpEnabled: false,
        isSandbox: false,
        permissions: userPerms,
        stytchUserId,
        createdAt: new Date().toISOString()
    };

    if (isFirebaseAvailable()) {
        const docRef = await db.collection(getUCol()).add(userData);
        return { id: docRef.id, ...userData, password: undefined };
    }

    const doc = localStore.insert(getUCol(), userData);
    return { ...doc, password: undefined };
};

const updateUser = async (id, data) => {
    const user = await findById(id);
    if (!user) throw new Error('User not found');

    // Only allow updating specific fields to prevent security issues
    const allowedFields = ['name', 'email', 'role', 'permissions', 'isOtpEnabled', 'isSandbox', 'password', 'otpCode', 'otpExpiry'];
    const filteredData = {};
    let bcryptHash = null;

    Object.keys(data).forEach(k => {
        if (allowedFields.includes(k)) {
            if (k === 'password' && data[k]) {
                bcryptHash = bcrypt.hashSync(data[k], 12);
                filteredData[k] = bcryptHash;
            } else {
                filteredData[k] = data[k];
            }
        }
    });

    // If password is being updated, sync it with Stytch
    if (bcryptHash) {
        const finalEmail = data.email || user.email || `${user.username}@vgtc.com`;
        try {
            await stytchService.migratePassword(finalEmail, bcryptHash);
        } catch (err) {
            if (err.message && err.message.toLowerCase().includes('already has a password')) {
                try {
                    console.log('[Auth] User already has a password set on Stytch. Resetting password via search/delete/migrate flow...');
                    const existingUser = await stytchService.searchUserByEmail(finalEmail);
                    if (existingUser && existingUser.password) {
                        const stytchUserId = existingUser.user_id;
                        const passwordId = existingUser.password.password_id;
                        await stytchService.deleteUserPassword(stytchUserId, passwordId);
                        // Now we can successfully migrate the new password!
                        await stytchService.migratePassword(finalEmail, bcryptHash);
                    } else {
                        throw new Error('User or password info not found on Stytch search');
                    }
                } catch (updateErr) {
                    console.error('[Auth] Stytch password reset during updateUser failed:', updateErr.message);
                    throw new Error(`Stytch password update failed: ${updateErr.message}`);
                }
            } else {
                console.error('[Auth] Stytch password migration during updateUser failed:', err.message);
                if (stytchService.isStytchConfigured()) {
                    throw new Error(`Stytch password update failed: ${err.message}`);
                }
            }
        }
    }

    if (isFirebaseAvailable()) {
        await db.collection(getUCol()).doc(id).update(filteredData);
        return;
    }
    localStore.update(getUCol(), id, filteredData);
}

const deleteUser = async (id) => {
    if (isFirebaseAvailable()) {
        const usersRef = db.collection(getUCol());
        const userDoc = await usersRef.doc(id).get();
        if (!userDoc.exists) throw new Error('User not found');
        const userData = userDoc.data();
        
        // Ensure we are not deleting across orgs if we have an admin context (optional but safe)
        
        if (userData.role === 'admin') {
            const adminSnapshot = await usersRef.where('role', '==', 'admin').where('orgId', '==', userData.orgId).get();
            if (adminSnapshot.size <= 1) throw new Error('Cannot delete the last admin of this organization');
        }
        await usersRef.doc(id).delete();
        return;
    }

    const all = localStore.getAll(getUCol());
    const user = all.find(u => u.id === id);
    if (!user) throw new Error('User not found');
    if (user.role === 'admin' && all.filter(u => u.role === 'admin' && u.orgId === user.orgId).length === 1)
        throw new Error('Cannot delete the last admin of this organization');
    localStore.delete(getUCol(), id);
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
    
    if (!user.otpExpiry) return false;
    const expiry = new Date(user.otpExpiry);
    if (expiry < new Date()) return false;

    // Clear OTP after success
    await updateUser(id, { otpCode: null, otpExpiry: null });
    return true;
};

const verifyPassword = (plain, hash) => bcrypt.compareSync(plain, hash);

module.exports = {
    getAll, findByUsername, findByUsernameAndOrg, findById, createUser, updateUser, deleteUser,
    verifyPassword, generateOTP, saveUserOTP, verifyOTP
};

// Seed default users ONLY in non-production environments.
// This prevents test accounts from being created/overwritten in the live database.
if (!isProduction()) {
    seed();
} else {
    console.log('[Auth] Production mode: skipping seed (test users will not be created).');
}
