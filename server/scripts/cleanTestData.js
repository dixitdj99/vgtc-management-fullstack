const { db, admin } = require('../firebase');

async function cleanTestData() {
    console.log('[Cleanup] Starting deletion of test data from production Firestore...');

    const TEST_PROFILES = ['4RBVeg6yCjOu1QPtLJNv', '6n7M8Bsj6QzYHrHMuWvR'];
    const TEST_PARTIES = [
        'QYznMKsIyryemJv3gnzz', // BAD LR TEST
        'QbDKty2x5CVfc2RlSYyb', // VOUCHER FIRST TEST
        'XP6aZuvG5eKGGcus6qR3', // TEST OWNER
        'Z6jHckfQQgeIJJgGl7xQ', // MANUAL LR TEST
        'mnShv4Bb2bnoyDkdsxGY', // AUTO LR TEST
    ];

    // 1. Delete test parties
    console.log('\n--- 1. Deleting test parties ---');
    for (const id of TEST_PARTIES) {
        const ref = db.collection('parties').doc(id);
        const doc = await ref.get();
        if (doc.exists) {
            console.log(`Deleting party ${id}: "${doc.data().name}"`);
            await ref.delete();
        } else {
            console.log(`Party ${id} already deleted or not found.`);
        }
    }

    // Also check any other dummy parties in 'parties'
    const partiesSnap = await db.collection('parties').get();
    for (const doc of partiesSnap.docs) {
        const name = (doc.data().name || '').toUpperCase();
        if (/\b(TEST|DUMMY)\b/.test(name) || name.includes('TEST')) {
            console.log(`Found and deleting extra test party ${doc.id}: "${name}"`);
            await doc.ref.delete();
        }
    }

    // 2. Delete test profiles
    console.log('\n--- 2. Deleting test profiles ---');
    for (const id of TEST_PROFILES) {
        const ref = db.collection('profiles').doc(id);
        const doc = await ref.get();
        if (doc.exists) {
            console.log(`Deleting profile ${id}: "${doc.data().name}" (${doc.data().type})`);
            await ref.delete();
        } else {
            console.log(`Profile ${id} already deleted.`);
        }
    }

    // 3. Delete profile payments linked to test profiles
    console.log('\n--- 3. Deleting linked profile_payments ---');
    const paySnap = await db.collection('profile_payments').get();
    for (const doc of paySnap.docs) {
        const data = doc.data();
        if (TEST_PROFILES.includes(data.profileId) || (data.profileName && /parem|ekbal khan/i.test(data.profileName))) {
            console.log(`Deleting profile_payment ${doc.id} for "${data.profileName}"`);
            await doc.ref.delete();
        }
    }

    // 4. Delete attendance linked to test profiles
    console.log('\n--- 4. Deleting linked attendance ---');
    const attSnap = await db.collection('attendance').get();
    for (const doc of attSnap.docs) {
        const data = doc.data();
        if (TEST_PROFILES.includes(data.profileId) || (data.profileName && /parem|ekbal khan/i.test(data.profileName)) || TEST_PROFILES.some(p => doc.id.includes(p))) {
            console.log(`Deleting attendance doc ${doc.id}`);
            await doc.ref.delete();
        }
    }

    // 5. Delete attendance_events linked to test profiles
    console.log('\n--- 5. Deleting linked attendance_events ---');
    const attEvSnap = await db.collection('attendance_events').get();
    for (const doc of attEvSnap.docs) {
        const data = doc.data();
        if (TEST_PROFILES.includes(data.employeeId) || (data.employeeName && /parem|ekbal khan/i.test(data.employeeName))) {
            console.log(`Deleting attendance_event ${doc.id} for "${data.employeeName}"`);
            await doc.ref.delete();
        }
    }

    // 6. Delete test cashbook entries linked to test profiles
    console.log('\n--- 6. Deleting linked jkl_cashbook entries ---');
    const cashSnap = await db.collection('jkl_cashbook').get();
    for (const doc of cashSnap.docs) {
        const data = doc.data();
        if (TEST_PROFILES.includes(data.entityId) || (data.remark && /uchanti k leye|poineer labour|dipak uchanti|ekbal khan aaya/i.test(data.remark))) {
            console.log(`Deleting jkl_cashbook entry ${doc.id}: "${data.remark}" (${data.amount})`);
            await doc.ref.delete();
        }
    }

    console.log('\n[Cleanup] Finished deleting all test data from Firestore successfully.');
}

cleanTestData().then(() => process.exit(0)).catch(err => {
    console.error('[Cleanup Error]', err);
    process.exit(1);
});
