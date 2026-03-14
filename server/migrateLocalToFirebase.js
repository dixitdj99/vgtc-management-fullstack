const fs = require('fs');
const path = require('path');
const { db, admin, isAvailable } = require('./firebase');

const DATA_DIR = path.join(__dirname, 'data');
const COLLECTIONS = [
    'vouchers',
    'loading_receipts',
    'jkl_loading_receipts',
    'vehicles',
    'stock_additions',
    'jkl_stock_additions',
    'challans',
    'jkl_challans',
    'cashbook',
    'jkl_cashbook',
    'users'
];

async function migrate() {
    console.log('🚀 Starting Migration to Firestore...');

    if (!isAvailable()) {
        console.error('❌ Firebase is not connected. Please ensure server/serviceAccountKey.json exists.');
        process.exit(1);
    }

    for (const col of COLLECTIONS) {
        const file = path.join(DATA_DIR, col + '.json');
        if (!fs.existsSync(file)) {
            console.log(`- Skipping ${col}: No local file found.`);
            continue;
        }

        console.log(`📦 Migrating ${col}...`);
        try {
            const data = JSON.parse(fs.readFileSync(file, 'utf8'));
            if (!Array.isArray(data)) {
                console.warn(`! Skipping ${col}: File data is not an array.`);
                continue;
            }

            const batch = db.batch();
            let count = 0;

            for (const item of data) {
                const { id, ...rest } = item;
                const docRef = db.collection(col).doc(id || undefined);
                
                // Convert string dates to Firestore Timestamps if possible, 
                // but for now, we'll keep them as strings for compatibility with the existing frontend.
                // We just need to ensure createdAt is handled.
                if (!rest.createdAt) {
                    rest.createdAt = admin.firestore.FieldValue.serverTimestamp();
                }

                batch.set(docRef, rest);
                count++;
                
                // Firestore batches are limited to 500 operations
                if (count % 400 === 0) {
                    await batch.commit();
                    console.log(`  - Committed ${count} items...`);
                }
            }

            if (count % 400 !== 0) {
                await batch.commit();
            }
            console.log(`✅ Migrated ${count} items into ${col}`);
        } catch (e) {
            console.error(`❌ Failed to migrate ${col}:`, e.message);
        }
    }

    // Migrate Counters
    const countersFile = path.join(DATA_DIR, '_counters.json');
    if (fs.existsSync(countersFile)) {
        console.log('📦 Migrating counters...');
        try {
            const counters = JSON.parse(fs.readFileSync(countersFile, 'utf8'));
            if (counters.lr_no) {
                await db.collection('metadata').doc('lr_counter').set({ count: counters.lr_no });
                console.log(`✅ Migrated LR counter: ${counters.lr_no}`);
            }
            if (counters.jkl_lr_no) {
                await db.collection('metadata').doc('jkl_lr_counter').set({ count: counters.jkl_lr_no });
                console.log(`✅ Migrated JKL LR counter: ${counters.jkl_lr_no}`);
            }
        } catch (e) {
            console.error('❌ Failed to migrate counters:', e.message);
        }
    }

    console.log('🎉 Migration complete!');
    process.exit(0);
}

migrate();
