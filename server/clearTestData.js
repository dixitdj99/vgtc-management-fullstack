const { db, admin, isAvailable: firebaseAvailable } = require('./firebase');
const localStore = require('./utils/localStore');
const fs = require('fs');
const path = require('path');

const COLLECTIONS = [
  // JK Super
  'loading_receipts', 'vouchers', 'cashbook', 'stock_additions', 'challans', 'materials', 'parties', 'sell_entries', 'diesel_entries',
  // JK Lakshmi
  'jkl_loading_receipts', 'jkl_vouchers', 'jkl_cashbook', 'jkl_stock_additions', 'jkl_challans', 'jkl_materials', 'jkl_parties', 'jkl_sell_entries',
  // Shared/Other
  'vehicles', 'mileage'
];

const METADATA_COLLECTION = 'metadata';
const COUNTER_DOC = 'lr_counter';
const JKL_METADATA_COLLECTION = 'jkl_metadata';
const JKL_COUNTER_DOC = 'lr_counter';

async function clearFirebaseCollection(collectionName) {
  const snapshot = await db.collection(collectionName).get();
  if (snapshot.size === 0) return 0;
  let batch = db.batch();
  let count = 0;
  snapshot.docs.forEach(doc => {
    batch.delete(doc.ref);
    count++;
  });
  await batch.commit();
  return count;
}

async function run() {
  console.log('--- CLEARING TEST DATA ---');
  if (firebaseAvailable()) {
    console.log('Firebase is available. Wiping collections...');
    for (const col of COLLECTIONS) {
      try {
        const count = await clearFirebaseCollection(col);
        console.log(`Cleared ${count} documents from ${col}`);
      } catch (e) {
        console.error(`Failed to clear ${col}:`, e.message);
      }
    }
    // Explicitly reset lr_counter document in metadata for both Super and JKL
    try {
      await db.collection(METADATA_COLLECTION).doc(COUNTER_DOC).set({ count: 0 });
      console.log('Reset Firestore metadata/lr_counter to 0 (Super)');
      
      await db.collection(JKL_METADATA_COLLECTION).doc(JKL_COUNTER_DOC).set({ count: 0 });
      console.log('Reset Firestore jkl_metadata/lr_counter to 0 (JKL)');
    } catch (e) {
      console.error('Failed to reset Firestore lr_counter:', e.message);
    }
  } else {
    console.log('Firebase not available. Wiping local data files...');
    for (const col of COLLECTIONS) {
      const p = path.join(__dirname, 'data', `${col}.json`);
      if (fs.existsSync(p)) {
        fs.unlinkSync(p);
        console.log(`Deleted ${p}`);
      }
    }
    // Delete local counters file
    const counterPath = path.join(__dirname, 'data', '_counters.json');
    if (fs.existsSync(counterPath)) {
      fs.unlinkSync(counterPath);
      console.log(`Deleted local counter file: ${counterPath}`);
    }
  }
  console.log('--- DONE ---');
}

run().catch(console.error).finally(() => process.exit(0));
