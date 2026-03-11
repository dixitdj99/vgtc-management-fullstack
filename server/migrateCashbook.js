const fb = require('./firebase');
const localData = require('./data/cashbook.json');

const COLLECTION = 'cashbook';

async function migrate() {
    console.log(`Migrating ${localData.length} entries to Firestore...`);
    const db = fb.db;
    const admin = fb.admin;

    let success = 0;

    for (const entry of localData) {
        try {
            const { id, ...data } = entry;
            const ref = db.collection(COLLECTION).doc();

            // Try to preserve original created date if available
            const createdAt = data.createdAt
                ? admin.firestore.Timestamp.fromDate(new Date(data.createdAt))
                : admin.firestore.FieldValue.serverTimestamp();

            await ref.set({ ...data, createdAt });
            success++;
        } catch (e) {
            console.error('Failed to migrate entry:', entry, e);
        }
    }

    console.log(`Migration complete. Successfully migrated ${success}/${localData.length} entries.`);
    process.exit(0);
}

migrate();
