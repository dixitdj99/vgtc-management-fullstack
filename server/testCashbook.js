const fb = require('./firebase');
const COLLECTION = 'cashbook';

async function testFetch() {
    console.log('Fetching cashbook from Firestore...');
    try {
        const db = fb.db;
        const snapshot = await db.collection(COLLECTION).get();
        const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        console.log(`Found ${docs.length} entries in Firestore:`);
        console.log(JSON.stringify(docs, null, 2));
    } catch (e) {
        console.error('Error fetching:', e);
    }
    process.exit(0);
}

testFetch();
