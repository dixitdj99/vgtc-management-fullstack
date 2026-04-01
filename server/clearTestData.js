const { db, isAvailable: firebaseAvailable } = require('./firebase');
const localStore = require('./utils/localStore');
const fs = require('fs');
const path = require('path');

const COLLECTIONS = [
  'vouchers', 'lr', 'jkl_lr', 'cashbook', 'jkl_cashbook',
  'stock_additions', 'jkl_stock_additions', 'challans', 'jkl_challans',
  'vehicles', 'diesel_entries', 'users', 'settings', 'materials', 'parties'
];

const METADATA_COLLECTION = 'metadata';
const COUNTER_DOC = 'lr_counter';

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
    // Explicitly reset lr_counter document in metadata
    try {
      await db.collection(METADATA_COLLECTION).doc(COUNTER_DOC).set({ count: 0 });
      console.log('Reset Firestore lr_counter to 0');
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
