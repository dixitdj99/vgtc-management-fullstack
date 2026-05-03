/**
 * orgService.js — CRUD for Organizations (multi-tenant)
 *
 * Each organization gets its own isolated set of Firestore collections.
 * Plans: free | basic | premium | enterprise (all free — no gateway charges)
 */
const localStore = require('../utils/localStore');
const { db, isAvailable } = require('../firebase');
const { getEnvPrefix } = require('../utils/envConfig');

const getOrgCol = () => `${getEnvPrefix()}organizations`;

const PLANS = {
    free:       { label: 'Free',       maxUsers: 3,  modules: ['lr', 'voucher', 'balance'] },
    basic:      { label: 'Basic',      maxUsers: 10, modules: ['lr', 'voucher', 'balance', 'stock', 'cashbook', 'invoice', 'sell'] },
    premium:    { label: 'Premium',    maxUsers: 25, modules: ['lr', 'voucher', 'balance', 'stock', 'cashbook', 'invoice', 'sell', 'vehicle', 'diesel', 'mileage', 'pay', 'loading_status', 'backup'] },
    enterprise: { label: 'Enterprise', maxUsers: -1, modules: ['*'] }, // unlimited
};

const ALL_MODULES = [
    'lr', 'voucher', 'balance', 'stock', 'cashbook',
    'vehicle', 'diesel', 'mileage', 'pay', 'sell',
    'invoice', 'loading_status', 'backup'
];

const isFirebaseAvailable = () => isAvailable();

/**
 * Get all organizations
 */
const getAll = async () => {
    if (isFirebaseAvailable()) {
        const snap = await db.collection(getOrgCol()).get();
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }
    return localStore.getAll(getOrgCol());
};

/**
 * Get a single org by ID
 */
const getById = async (id) => {
    if (isFirebaseAvailable()) {
        const doc = await db.collection(getOrgCol()).doc(id).get();
        if (!doc.exists) return null;
        return { id: doc.id, ...doc.data() };
    }
    return localStore.getAll(getOrgCol()).find(o => o.id === id) || null;
};

/**
 * Get org by slug (used for login)
 */
const getBySlug = async (slug) => {
    if (isFirebaseAvailable()) {
        const snap = await db.collection(getOrgCol()).where('slug', '==', slug).limit(1).get();
        if (snap.empty) return null;
        return { id: snap.docs[0].id, ...snap.docs[0].data() };
    }
    return localStore.getAll(getOrgCol()).find(o => o.slug === slug) || null;
};

/**
 * Create a new organization
 */
const createOrg = async (data) => {
    const slug = (data.slug || data.name || '').toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
    if (!slug) throw new Error('Organization slug is required');

    // Check duplicate slug
    const existing = await getBySlug(slug);
    if (existing) throw new Error(`Organization slug "${slug}" already exists`);

    const plan = data.plan || 'free';
    const planConfig = PLANS[plan] || PLANS.free;

    const orgData = {
        name: data.name || 'Unnamed Organization',
        slug,
        logo: data.logo || '',
        address: data.address || '',
        contact: data.contact || '',
        email: data.email || '',
        gstin: data.gstin || '',
        panNo: data.panNo || '',

        plan,
        planLabel: planConfig.label,
        maxUsers: planConfig.maxUsers,
        isActive: true,

        // Modules: use plan defaults or custom list
        enabledModules: data.enabledModules || planConfig.modules,

        // Locations: configurable per org
        locations: data.locations || [],

        // UPI Payment tracking
        payments: [],

        createdAt: new Date().toISOString(),
        createdBy: data.createdBy || 'superadmin',
    };

    if (isFirebaseAvailable()) {
        const ref = await db.collection(getOrgCol()).add(orgData);
        return { id: ref.id, ...orgData };
    }
    return localStore.insert(getOrgCol(), orgData);
};

/**
 * Update an organization
 */
const updateOrg = async (id, data) => {
    const allowed = [
        'name', 'logo', 'address', 'contact', 'email', 'gstin', 'panNo',
        'plan', 'maxUsers', 'isActive', 'enabledModules', 'locations', 'payments',
    ];
    const filtered = {};
    Object.keys(data).forEach(k => {
        if (allowed.includes(k)) filtered[k] = data[k];
    });

    // If plan changed, update plan metadata
    if (filtered.plan && PLANS[filtered.plan]) {
        const pc = PLANS[filtered.plan];
        filtered.planLabel = pc.label;
        if (!filtered.maxUsers) filtered.maxUsers = pc.maxUsers;
        if (!filtered.enabledModules) filtered.enabledModules = pc.modules;
    }

    filtered.updatedAt = new Date().toISOString();

    if (isFirebaseAvailable()) {
        await db.collection(getOrgCol()).doc(id).update(filtered);
        return;
    }
    localStore.update(getOrgCol(), id, filtered);
};

/**
 * Delete (deactivate) an organization
 */
const deactivateOrg = async (id) => {
    return updateOrg(id, { isActive: false });
};

/**
 * Record a UPI payment for an org
 */
const recordPayment = async (orgId, paymentData) => {
    const org = await getById(orgId);
    if (!org) throw new Error('Organization not found');

    const payment = {
        id: require('crypto').randomUUID(),
        amount: paymentData.amount || 0,
        utrNumber: paymentData.utrNumber || '',
        payerName: paymentData.payerName || '',
        paymentDate: paymentData.paymentDate || new Date().toISOString(),
        plan: paymentData.plan || org.plan,
        status: 'pending', // pending | verified | rejected
        note: paymentData.note || '',
        createdAt: new Date().toISOString(),
    };

    const payments = [...(org.payments || []), payment];
    await updateOrg(orgId, { payments });
    return payment;
};

/**
 * Verify a payment and upgrade org plan
 */
const verifyPayment = async (orgId, paymentId, newPlan) => {
    const org = await getById(orgId);
    if (!org) throw new Error('Organization not found');

    const payments = (org.payments || []).map(p => {
        if (p.id === paymentId) {
            return { ...p, status: 'verified', verifiedAt: new Date().toISOString() };
        }
        return p;
    });

    const planConfig = PLANS[newPlan] || PLANS[org.plan];
    await updateOrg(orgId, {
        payments,
        plan: newPlan || org.plan,
        maxUsers: planConfig.maxUsers,
        enabledModules: planConfig.modules,
    });
};

/**
 * Check if a module is enabled for an org
 */
const isModuleEnabled = (org, moduleName) => {
    if (!org || !org.isActive) return false;
    if (!org.enabledModules) return false;
    if (org.enabledModules.includes('*')) return true;
    return org.enabledModules.includes(moduleName);
};

/**
 * Seed default VGTC org on first run
 */
const seedDefaultOrg = async () => {
    try {
        const existing = await getBySlug('vgtc');
        if (!existing) {
            await createOrg({
                name: 'Vikas Goods Transport Co.',
                slug: 'vgtc',
                address: 'Near Rao Gopal Dev Chowk, Narnaul Road, Rewari',
                contact: '9416319445',
                email: 'vikasgoodstransport1234@gmail.com',
                gstin: '06ARIPK9021C2Z2',
                panNo: 'ARIPK9021C',
                plan: 'enterprise',
                enabledModules: ALL_MODULES,
                locations: [
                    { id: 'kosli', label: 'Kosli Dump', plantKey: 'jksuper', godownKey: 'kosli', color: '#6366f1' },
                    { id: 'jhajjar', label: 'Jhajjar Dump', plantKey: 'jksuper', godownKey: 'jhajjar', color: '#14b8a6' },
                    { id: 'jharli', label: 'Jharli Dump & Plant', plantKey: 'jklakshmi', color: '#f59e0b' },
                ],
                createdBy: 'system',
            });
            console.log('[OrgService] Default VGTC organization created');
        }
    } catch (err) {
        console.error('[OrgService] Seed failed:', err.message);
    }
};

module.exports = {
    getAll, getById, getBySlug, createOrg, updateOrg, deactivateOrg,
    recordPayment, verifyPayment, isModuleEnabled, seedDefaultOrg,
    PLANS, ALL_MODULES,
};
