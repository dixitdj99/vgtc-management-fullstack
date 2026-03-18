const svc = require('./utils/cashbookService');
const { isAvailable } = require('./firebase');
const fs = require('fs');

async function test() {
    console.log('Firebase available:', isAvailable());
    const cb = await svc.getAll('cashbook');
    const jkl = await svc.getAll('jkl_cashbook');
    fs.writeFileSync('cashbook_test_out.json', JSON.stringify({ cb_length: cb.length, jkl_length: jkl.length, cb, jkl }, null, 2));
    console.log('Done, wrote to cashbook_test_out.json. Lengths:', cb.length, jkl.length);
}

test().catch(console.error);
