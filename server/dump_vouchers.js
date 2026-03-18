const { db } = require('./firebase');

async function testVouchers() {
    const snapshot = await db.collection('vouchers').get();
    const docs = snapshot.docs.map(doc => doc.data());
    const dump = docs.filter(d => d.type === 'Dump' || d.type === 'JK_Super');
    const jkl = docs.filter(d => d.type === 'JK_Lakshmi');
    
    // summarize cash advances
    const dumpCash = dump.reduce((sum, v) => sum + (parseFloat(v.advanceCash) || 0), 0);
    const jklCash = jkl.reduce((sum, v) => sum + (parseFloat(v.advanceCash) || 0), 0);
    
    const fs = require('fs');
    fs.writeFileSync('vouchers_dump_test.json', JSON.stringify({
        dump_count: dump.length,
        jkl_count: jkl.length,
        dumpCash,
        jklCash
    }, null, 2));
    
    console.log('voucher stats written to vouchers_dump_test.json');
}

testVouchers().catch(console.error);
