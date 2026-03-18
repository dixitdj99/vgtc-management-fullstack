const { db, isAvailable: firebaseAvailable } = require('./firebase');
const localStore = require('./utils/localStore');
const fs = require('fs');
const path = require('path');

const COLLECTIONS = [
  'vouchers', 'lr', 'jkl_lr', 'cashbook', 'jkl_cashbook',
  'stock_additions', 'jkl_stock_additions', 'challans', 'jkl_challans',
  'vehicles', 'diesel_entries'
];

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
  } else {
    console.log('Firebase not available. Wiping local data files...');
    for (const col of COLLECTIONS) {
      const p = path.join(__dirname, 'data', `${col}.json`);
      if (fs.existsSync(p)) {
        fs.unlinkSync(p);
        console.log(`Deleted ${p}`);
      }
    }
  }
  console.log('--- DONE ---');
}

run().catch(console.error).finally(() => process.exit(0));
