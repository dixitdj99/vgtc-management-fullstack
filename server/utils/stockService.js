const localStore = require('./localStore');
const MATERIALS = ['PPC', 'OPC43', 'Adstar', 'OPC FS', 'OPC53 FS', 'Weather'];
const SCOL = 'stock_additions';
const CCOL = 'challans';

module.exports = {
    MATERIALS,

    // Initialize/migrate existing challans on startup
    init: (col = CCOL) => {
        try {
            const all = localStore.getAll(col);
            let updated = false;
            const migrated = all.map(c => {
                if (!c.materials && c.material) {
                    updated = true;
                    // Migrate old structure to new materials array
                    return {
                        ...c,
                        materials: [{ type: c.material, totalBags: c.quantity, loadedBags: 0 }]
                    };
                }
                return c;
            });
            if (updated) {
                // Save migrated back to store
                // Using a private method or rewriting the whole collection
                const path = require('path');
                const fs = require('fs');
                const file = path.join(__dirname, '..', 'data', CCOL + '.json');
                fs.writeFileSync(file, JSON.stringify(migrated, null, 2), 'utf8');
            }
        } catch (e) {
            console.error('Migration failed:', e.message);
        }
    },

    /* ── Stock Additions ── */
    getAllAdditions: (sCol = SCOL) => localStore.getAll(sCol),

    getHistory: (sCol = SCOL) => {
        return localStore.getAll(sCol).sort((a, b) => new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date));
    },

    addStock: (data, sCol = SCOL, allowedMaterials = MATERIALS) => {
        const { material, quantity, date, remark } = data;
        if (!allowedMaterials.includes(material)) throw new Error('Invalid material: ' + material);
        const qty = parseFloat(quantity);
        if (!qty || qty <= 0) throw new Error('Quantity must be positive');
        return localStore.insert(sCol, {
            material,
            quantity: qty,
            date: date || new Date().toISOString().slice(0, 10),
            remark: remark || '',
        });
    },

    getOverview: (sCol = SCOL, cCol = CCOL) => {
        const additions = localStore.getAll(sCol);
        const challans = localStore.getAll(cCol);
        return { additions, challans };
    },

    deleteAddition: (id, sCol = SCOL) => {
        const all = localStore.getAll(sCol);
        if (!all.find(d => d.id === id)) throw new Error('Entry not found');
        localStore.delete(sCol, id);
    },

    /* ── Challans ── */
    getAllChallans: (cCol = CCOL) => localStore.getAll(cCol),

    createChallan: (data, cCol = CCOL, allowedMaterials = MATERIALS) => {
        let { truckNo, materials, partyName, date, remark, material, quantity } = data;
        // Fallback for old requests
        if (material && quantity && !materials) {
            materials = [{ type: material, totalBags: parseInt(quantity) }];
        }

        if (!materials || !materials.length) throw new Error('Materials required');

        const cleanMaterials = materials.map(m => {
            if (!allowedMaterials.includes(m.type)) throw new Error('Invalid material: ' + m.type);
            const qty = parseInt(m.totalBags);
            if (!qty || qty <= 0) throw new Error('Quantity must be positive');
            return { type: m.type, totalBags: qty, loadedBags: 0 };
        });

        if (!truckNo) throw new Error('Truck number required');
        // Auto challan number
        const existing = localStore.getAll(cCol);
        const num = String(existing.length + 1).padStart(4, '0');
        const challanNo = 'CH-' + num;

        return localStore.insert(cCol, {
            challanNo,
            truckNo,
            materials: cleanMaterials,
            material: cleanMaterials.length === 1 ? cleanMaterials[0].type : 'Multiple', // legacy fallback
            quantity: cleanMaterials.reduce((acc, m) => acc + m.totalBags, 0), // legacy sum
            partyName: partyName || '',
            date: date || new Date().toISOString().slice(0, 10),
            remark: remark || '',
            status: 'open',   // open | partially_loaded | loaded | cancelled
        });
    },

    updateChallanStatus: (id, status, cCol = CCOL) => {
        const allowed = ['open', 'partially_loaded', 'loaded', 'cancelled'];
        if (!allowed.includes(status)) throw new Error('Invalid status');
        return localStore.update(cCol, id, { status });
    },

    getOpenChallans: (cCol = CCOL) => {
        const all = localStore.getAll(cCol).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        return all.filter(c => c.status === 'open' || c.status === 'partially_loaded');
    },

    deductChallanQuantities: (challanNo, deductions, cCol = CCOL) => {
        // deductions: [{ type, bags }]
        const all = localStore.getAll(cCol);
        const challan = all.find(c => c.challanNo === challanNo);
        if (!challan) throw new Error('Challan not found: ' + challanNo);

        if (!challan.materials) return challan; // Old challan not migrated?

        let allFullyLoaded = true;
        let anyLoaded = false;

        const newMaterials = challan.materials.map(mat => {
            const deduction = deductions.find(d => d.type === mat.type);
            if (deduction) {
                mat.loadedBags = (mat.loadedBags || 0) + parseInt(deduction.bags);
            }
            if (mat.loadedBags < mat.totalBags) allFullyLoaded = false;
            if (mat.loadedBags > 0) anyLoaded = true;
            return mat;
        });

        let newStatus = challan.status;
        if (newStatus !== 'cancelled') {
            if (allFullyLoaded) newStatus = 'loaded';
            else if (anyLoaded) newStatus = 'partially_loaded';
        }

        return localStore.update(cCol, challan.id, { materials: newMaterials, status: newStatus });
    },

    updateChallan: (id, updates, cCol = CCOL) => {
        return localStore.update(cCol, id, updates);
    },

    deleteChallan: (id, cCol = CCOL) => {
        if (!localStore.getAll(cCol).find(d => d.id === id)) throw new Error('Challan not found');
        localStore.delete(cCol, id);
    },
};
