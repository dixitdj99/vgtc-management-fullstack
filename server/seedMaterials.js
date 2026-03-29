const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const MATERIALS_DUMP = ['PPC', 'OPC43', 'Adstar', 'OPC FS', 'OPC53 FS', 'Weather'];
const MATERIALS_JKL = ['PPC', 'OPC43', 'Pro+'];

async function seed() {
  try {
    for (const name of MATERIALS_DUMP) {
        const snap = await db.collection('materials').where('name', '==', name).get();
        if (snap.empty) {
           await db.collection('materials').add({ name, createdAt: admin.firestore.FieldValue.serverTimestamp() });
           console.log('Added to Dump:', name);
        }
    }
    
    for (const name of MATERIALS_JKL) {
        const snap = await db.collection('jkl_materials').where('name', '==', name).get();
        if (snap.empty) {
           await db.collection('jkl_materials').add({ name, createdAt: admin.firestore.FieldValue.serverTimestamp() });
           console.log('Added to JKL:', name);
        }
    }
    console.log('Done!');
    process.exit(0);
  } catch (e) {
      console.error(e);
      process.exit(1);
  }
}

seed();
