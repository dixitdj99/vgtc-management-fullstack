const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Initialize Firebase
const { db, isAvailable } = require('../firebase');
const { getEnvPrefix } = require('../utils/envConfig');

if (!isAvailable()) {
    console.error('Firebase is not available. Please check your configuration.');
    process.exit(1);
}

const ORG_ID = 'vgtc';
const PREFIX = getEnvPrefix();

const COLLECTIONS = [
    'users',
    'vehicles',
    'parties',
    'ledger_entries',
    'cashbook',
    'sales',
    'kosli_loading_receipts',
    'jhajjar_loading_receipts',
    'jkl_loading_receipts',
    'kosli_stock_additions',
    'jhajjar_stock_additions',
    'jkl_stock_additions',
    'kosli_materials',
    'jhajjar_materials',
    'jkl_materials',
    'kosli_challans',
    'jhajjar_challans',
    'jkl_challans',
    'kosli_metadata',
    'jhajjar_metadata',
    'jkl_metadata',
    'labourers',
    'mileage',
    'maintenance',
    'vehicle_advances',
    'profile_payments',
    'profiles',
    'stock_transfers'
];

async function migrateFirestore() {
    console.log(`Starting Firestore migration for organization: ${ORG_ID}`);
    console.log(`Environment Prefix: ${PREFIX || '(none)'}`);

    for (const baseCol of COLLECTIONS) {
        const colName = `${PREFIX}${baseCol}`;
        const testColName = `${PREFIX}test_${baseCol}`;
        
        await migrateCollection(colName);
        await migrateCollection(testColName);
    }
    console.log('Firestore migration complete.');
}

async function migrateCollection(colName) {
    console.log(`Checking collection: ${colName}`);
    try {
        const snap = await db.collection(colName).get();
        if (snap.empty) {
            return;
        }

        let count = 0;
        const batch = db.batch();
        
        snap.forEach(doc => {
            const data = doc.data();
            if (!data.orgId) {
                batch.update(doc.ref, { orgId: ORG_ID });
                count++;
            }
        });

        if (count > 0) {
            await batch.commit();
            console.log(`  - Updated ${count} documents in ${colName}`);
        } else {
            console.log(`  - No updates needed for ${colName}`);
        }
    } catch (err) {
        if (err.code === 5 || err.message.includes('NOT_FOUND')) {
            // Collection doesn't exist, skip silently
        } else {
            console.error(`Error migrating ${colName}:`, err.message);
        }
    }
}

async function migrateLocalStore() {
    console.log('Starting LocalStore migration...');
    const dataDir = path.join(__dirname, '..', 'data');
    if (!fs.existsSync(dataDir)) {
        console.log('No local data directory found. Skipping LocalStore migration.');
        return;
    }

    const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.json'));
    for (const file of files) {
        const filePath = path.join(dataDir, file);
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const data = JSON.parse(content);
            if (!Array.isArray(data)) continue;

            let updated = false;
            const newData = data.map(item => {
                if (typeof item === 'object' && item !== null && !item.orgId) {
                    updated = true;
                    return { ...item, orgId: ORG_ID };
                }
                return item;
            });

            if (updated) {
                fs.writeFileSync(filePath, JSON.stringify(newData, null, 2));
                console.log(`  - Updated ${file}`);
            }
        } catch (err) {
            console.error(`Error migrating ${file}:`, err.message);
        }
    }
    console.log('LocalStore migration complete.');
}

async function main() {
    try {
        await migrateFirestore();
        await migrateLocalStore();
        process.exit(0);
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    }
}

main();
