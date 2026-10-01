const test = require('node:test');
const assert = require('node:assert/strict');
const {
    billTypeForCollection,
    voucherCollectionForLr,
    validateBillDetails,
    buildBillFromLr,
} = require('../services/lrBillService');

test('only three godown receipt books create bills', () => {
    assert.equal(billTypeForCollection('dev_kosli_loading_receipts'), 'Kosli_Bill');
    assert.equal(billTypeForCollection('dev_test_jhajjar_loading_receipts'), 'Jajjhar_Bill');
    assert.equal(billTypeForCollection('bahadurgarh_loading_receipts'), 'Bahadurgarh_Bill');
    assert.equal(billTypeForCollection('dev_jkl_loading_receipts'), null);
    assert.equal(billTypeForCollection('dev_loading_receipts'), null);
    assert.equal(voucherCollectionForLr('dev_test_kosli_loading_receipts'), 'dev_test_vouchers');
});

test('bill metadata validated when required and optional by default', () => {
    assert.throws(() => validateBillDetails({ partyCode: 'P1' }, { required: true }), /Bill number/);
    assert.throws(() => validateBillDetails({ billNo: 'B1' }, { required: true }), /Party code/);
    assert.doesNotThrow(() => validateBillDetails({ billNo: 'B1', partyCode: 'P1' }, { required: true }));
    assert.doesNotThrow(() => validateBillDetails({}));
});

test('generated bill shares LR identity, totals materials, and calculates commission', async () => {
    const bill = await buildBillFromLr('vgtc', {
        billNo: ' B-101 ', partyCode: ' P-7 ', date: '2026-10-01', truckNo: 'HR55EF9012',
        partyName: 'Example Party', destination: '',
        materials: [
            { type: 'PPC', bags: 20, weight: 1 },
            { type: 'OPC', bags: 10, weight: .5 },
        ],
    }, { lrNo: 42, entryId: 1001, sourceLrId: 'lr-doc-1', type: 'Kosli_Bill' });
    assert.equal(bill.lrNo, '42');
    assert.equal(bill.entryId, 1001);
    assert.equal(bill.lrEntryId, 1001);
    assert.equal(bill.sourceLrId, 'lr-doc-1');
    assert.equal(bill.billNo, 'B-101');
    assert.equal(bill.partyCode, 'P-7');
    assert.equal(bill.bags, '30');
    assert.equal(bill.weight, '1.50');
    assert.equal(bill.commission, 45);
    assert.equal(bill.rate, '');
});
