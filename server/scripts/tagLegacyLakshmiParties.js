/** One-time production migration. Dry run unless --apply is supplied. */
require('dotenv').config();
const { db, admin, isAvailable } = require('../firebase');
const { isProduction } = require('../utils/envConfig');

const run = async () => {
    if (!isProduction() || process.env.APP_ENV !== 'production') {
        throw new Error('Set APP_ENV=production explicitly; this migration only targets live parties');
    }
    if (!isAvailable()) throw new Error('Firestore unavailable');
    const apply = process.argv.includes('--apply');
    const snapshot = await db.collection('parties').get();
    const untagged = snapshot.docs.filter(doc => {
        const brands = doc.data().brands;
        return !Array.isArray(brands) || brands.length === 0;
    });
    console.log(`${snapshot.size} production parties; ${untagged.length} untagged; mode: ${apply ? 'apply' : 'dry run'}`);
    if (!apply) return;
    let tagged = 0;
    let skipped = 0;
    for (const doc of untagged) {
        await db.runTransaction(async tx => {
            const latest = await tx.get(doc.ref);
            if (!latest.exists || (Array.isArray(latest.data().brands) && latest.data().brands.length)) {
                skipped++;
                return;
            }
            tx.update(doc.ref, { brands: ['jklakshmi'], updatedAt: admin.firestore.FieldValue.serverTimestamp() });
            tagged++;
        });
    }
    console.log(`Tagged ${tagged} JK Lakshmi; skipped ${skipped} changed/deleted records`);
};

run().catch(err => { console.error(err.message); process.exitCode = 1; });
