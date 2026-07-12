const { db, isAvailable } = require('../firebase');
const localStore = require('../utils/localStore');
const { getEnvCol } = require('../utils/collectionUtils');

const getOCol = () => getEnvCol('organizations');

const DEFAULT_ORG = {
    id: 'vgtc',
    name: 'VIKAS GOODS TRANSPORT CO.',
    domain: '',
    logoUrl: '',
    status: 'active',
    config: {},
    moduleLabels: {},
    createdAt: new Date().toISOString()
};

const normalizeOrgId = (value) => String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');

const normalizeOrgPayload = (data = {}) => {
    const id = normalizeOrgId(data.id || data.slug || data.name);
    if (!id) throw new Error('Organization ID is required');
    if (!String(data.name || '').trim()) throw new Error('Organization name is required');

    return {
        id,
        name: String(data.name || '').trim(),
        domain: String(data.domain || '').trim().toLowerCase(),
        logoUrl: String(data.logoUrl || '').trim(),
        status: data.status || 'active',
        moduleLabels: data.moduleLabels && typeof data.moduleLabels === 'object' ? data.moduleLabels : {},
        config: {
            businessType: data.config?.businessType || data.businessType || 'transport',
            contactEmail: data.config?.contactEmail || data.contactEmail || '',
            contactPhone: data.config?.contactPhone || data.contactPhone || '',
            address: data.config?.address || data.address || '',
            primaryColor: data.config?.primaryColor || data.primaryColor || '#8b5cf6',
            accentColor: data.config?.accentColor || data.accentColor || '#6366f1',
            defaultPermissions: data.config?.defaultPermissions || data.defaultPermissions || {},
            enabledModules: data.config?.enabledModules || data.enabledModules || {},
            roleTemplates: data.config?.roleTemplates || data.roleTemplates || {},
            locations: data.config?.locations || data.locations || [],
            plan: data.config?.plan || data.plan || ''
        }
    };
};

const DATA_COLLECTIONS = [
    { key: 'users', label: 'Users', collection: 'users', envOnly: true },
    { key: 'parties', label: 'Parties', collection: 'parties' },
    { key: 'vehicles', label: 'Vehicles', collection: 'vehicles' },
    { key: 'vouchers', label: 'Vouchers', collection: 'vouchers' },
    { key: 'cashbook', label: 'Cashbook Entries', collection: 'cashbook' },
    { key: 'lr', label: 'Loading Receipts', collection: 'loading_receipts' },
    { key: 'kosliLr', label: 'Kosli Receipts', collection: 'kosli_loading_receipts' },
    { key: 'jhajjarLr', label: 'Jhajjar Receipts', collection: 'jhajjar_loading_receipts' },
    { key: 'advances', label: 'Vehicle Advances', collection: 'vehicle_advances' },
    { key: 'maintenance', label: 'Maintenance Records', collection: 'vehicle_maintenance' },
    { key: 'payments', label: 'Profile Payments', collection: 'profile_payments' },
    { key: 'profiles', label: 'Staff Profiles', collection: 'profiles' }
];

const resolveCol = (item) => item.envOnly ? getEnvCol(item.collection) : getEnvCol(item.collection);

const sanitizeUser = (user = {}) => ({
    id: user.id,
    name: user.name || '',
    username: user.username || '',
    role: user.role || 'user',
    email: user.email || '',
    orgId: user.orgId || 'vgtc',
    permissions: user.permissions || {},
    isOtpEnabled: !!user.isOtpEnabled,
    isSandbox: !!user.isSandbox
});

const countByOrg = async (collection, orgId) => {
    try {
        if (isAvailable()) {
            const snapshot = await db.collection(collection).where('orgId', '==', orgId).get();
            return snapshot.size || snapshot.docs?.length || 0;
        }
        return localStore.getAll(collection).filter(d => d.orgId === orgId).length;
    } catch (err) {
        console.warn(`[OrgService] Count failed for ${collection}/${orgId}:`, err.message);
        return 0;
    }
};

const getById = async (id) => {
    const col = getOCol();
    if (isAvailable()) {
        const doc = await db.collection(col).doc(id).get();
        if (!doc.exists) {
            console.warn(`[OrgService] Organization not found in Firestore: ${id} (Col: ${col})`);
            if (id === 'vgtc') {
                console.log(`[OrgService] Auto-seeding default organization 'vgtc' on demand.`);
                await db.collection(col).doc('vgtc').set(DEFAULT_ORG);
                return DEFAULT_ORG;
            }
            return null;
        }
        return { id: doc.id, ...doc.data() };
    }
    const org = localStore.getAll(col).find(o => o.id === id);
    if (!org) {
        console.warn(`[OrgService] Organization not found in LocalStore: ${id} (Col: ${col})`);
        if (id === 'vgtc') {
            console.log(`[OrgService] Auto-seeding default organization 'vgtc' in LocalStore.`);
            return localStore.insert(col, DEFAULT_ORG);
        }
    }
    return org;
};

const getAll = async () => {
    const col = getOCol();
    let orgs = [];
    if (isAvailable()) {
        const snapshot = await db.collection(col).get();
        orgs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } else {
        orgs = localStore.getAll(col);
    }

    if (!orgs.length) {
        const seeded = await getById('vgtc');
        orgs = seeded ? [seeded] : [];
    }

    return orgs.sort((a, b) => {
        if (a.id === 'vgtc') return -1;
        if (b.id === 'vgtc') return 1;
        return String(a.name || '').localeCompare(String(b.name || ''));
    });
};

const getUsersForOrg = async (orgId) => {
    const col = getEnvCol('users');
    if (isAvailable()) {
        const snapshot = await db.collection(col).where('orgId', '==', orgId).get();
        return snapshot.docs.map(doc => sanitizeUser({ id: doc.id, ...doc.data() }));
    }
    return localStore.getAll(col).filter(u => u.orgId === orgId).map(sanitizeUser);
};

const getOverview = async () => {
    const orgs = await getAll();
    const result = [];

    for (const org of orgs) {
        const data = {};
        for (const item of DATA_COLLECTIONS) {
            data[item.key] = {
                label: item.label,
                count: await countByOrg(resolveCol(item), org.id)
            };
        }

        const users = await getUsersForOrg(org.id);
        result.push({
            ...org,
            data,
            users,
            permissionSummary: {
                admins: users.filter(u => u.role === 'admin').length,
                standardUsers: users.filter(u => u.role !== 'admin').length,
                otpEnabled: users.filter(u => u.isOtpEnabled).length,
                sandboxUsers: users.filter(u => u.isSandbox).length
            }
        });
    }

    return result;
};

const createOrg = async (data) => {
    const payload = normalizeOrgPayload(data);
    const existing = await getById(payload.id);
    if (existing) throw new Error(`Organization "${payload.id}" already exists`);

    const orgData = {
        ...payload,
        createdAt: new Date().toISOString()
    };
    if (isAvailable()) {
        await db.collection(getOCol()).doc(payload.id).set(orgData);
        return orgData;
    }
    localStore.insert(getOCol(), orgData);
    return orgData;
};

const updateOrg = async (id, data) => {
    const allowed = {};
    ['name', 'domain', 'logoUrl', 'status', 'moduleLabels', 'config'].forEach(field => {
        if (data[field] !== undefined) allowed[field] = data[field];
    });
    if (allowed.name !== undefined) allowed.name = String(allowed.name || '').trim();
    if (allowed.domain !== undefined) allowed.domain = String(allowed.domain || '').trim().toLowerCase();
    if (allowed.logoUrl !== undefined) allowed.logoUrl = String(allowed.logoUrl || '').trim();

    if (isAvailable()) {
        await db.collection(getOCol()).doc(id).update(allowed);
        const updated = await getById(id);
        return updated || { id, ...allowed };
    }
    return localStore.update(getOCol(), id, allowed);
};

const seedDefaultOrg = async () => {
    try {
        const existing = await getById('vgtc');
        if (!existing) {
            await createOrg(DEFAULT_ORG);
            console.log('[Org] Seeded default organization: vgtc (active)');
        } else if (existing.status !== 'active') {
            await updateOrg('vgtc', { status: 'active' });
            console.log('[Org] Updated default organization status to: active');
        } else {
            console.log('[Org] Default organization vgtc is already seeded and active');
        }
    } catch (err) {
        console.error('[Org] Seed failed:', err.message);
    }
};

module.exports = { getById, getAll, getOverview, createOrg, updateOrg, seedDefaultOrg };
