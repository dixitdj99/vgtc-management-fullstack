const { db } = require('./firebase');

async function testOnlineAdv() {
    const snapshot = await db.collection('vouchers').get();
    const docs = snapshot.docs.map(doc => doc.data());
    const dump = docs.filter(d => d.type === 'Dump' || d.type === 'JK_Super');
    const jkl = docs.filter(d => d.type === 'JK_Lakshmi');
    
    // summarize online advances
    const dumpOnline = dump.reduce((sum, v) => sum + (parseFloat(v.advanceOnline) || 0), 0);
    const jklOnline = jkl.reduce((sum, v) => sum + (parseFloat(v.advanceOnline) || 0), 0);
    
    console.log(JSON.stringify({
        dumpOnline,
        jklOnline,
        dumpOnlineList: dump.filter(d => parseFloat(d.advanceOnline) > 0).map(d => ({ lrNo: d.lrNo, adv: d.advanceOnline })),
        jklOnlineList: jkl.filter(d => parseFloat(d.advanceOnline) > 0).map(d => ({ lrNo: d.lrNo, adv: d.advanceOnline }))
    }, null, 2));
}

testOnlineAdv().catch(console.error);
