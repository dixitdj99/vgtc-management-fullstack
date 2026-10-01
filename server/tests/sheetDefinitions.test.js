const test = require('node:test');
const assert = require('node:assert/strict');

process.env.JWT_SECRET ||= 'test-only-secret-that-is-not-used-outside-tests';
const { DEFINITIONS, BALANCE_COLUMNS, CHALLAN_COLUMNS } = require('../routes/sheetRoutes');

test('every sheet maps to one exact permission', () => {
    assert.equal(DEFINITIONS['balance-all'].permission, 'balance_all');
    assert.equal(DEFINITIONS['balance-kosli'].permission, 'balance_kosli');
    assert.equal(DEFINITIONS['balance-jhajjar'].type, 'Jajjhar_Bill');
    assert.equal(DEFINITIONS['challans-bahadurgarh'].permission, 'stock_bahadurgarh');
    assert.equal(DEFINITIONS['challans-jkl'].collection, 'jkl_challans');
});

test('computed balance columns remain read-only and data fields are editable', () => {
    for (const field of ['grossFreight', 'netBalance']) {
        assert.equal(BALANCE_COLUMNS.find(column => column.id === field).editable, false);
    }
    for (const field of ['truckNo', 'driverName', 'ownerName', 'weight', 'rate', 'advanceDiesel', 'destination']) {
        assert.equal(BALANCE_COLUMNS.find(column => column.id === field).editable, true);
    }
});

test('challan sheet permits validated status edits and data fields', () => {
    assert.ok(CHALLAN_COLUMNS.find(column => column.id === 'status').editable);
    assert.ok(CHALLAN_COLUMNS.find(column => column.id === 'status').options.includes('loaded'));
});

