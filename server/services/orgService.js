const { db, isAvailable } = require('../firebase');
const localStore = require('../utils/localStore');
const { getEnvCol } = require('../utils/collectionUtils');

const getOCol = () => getEnvCol('organizations');

const DEFAULT_ORG = {
    id: 'vgtc',
    name: 'VIKAS GOODS TRANSPORT CO.',
    status: 'active',
    moduleLabels: {},
    createdAt: new Date().toISOString()
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
    }
    return org;
};

const createOrg = async (data) => {
    const orgData = {
        ...data,
        createdAt: new Date().toISOString()
    };
    if (isAvailable()) {
        await db.collection(getOCol()).doc(data.id).set(orgData);
        return orgData;
    }
    localStore.insert(getOCol(), orgData);
    return orgData;
};

const updateOrg = async (id, data) => {
    if (isAvailable()) {
        await db.collection(getOCol()).doc(id).update(data);
        return { id, ...data };
    }
    localStore.update(getOCol(), id, data);
    return { id, ...data };
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

module.exports = { getById, createOrg, updateOrg, seedDefaultOrg };
