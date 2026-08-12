const assert = require('assert');
const destinationService = require('../services/destinationService');

async function runTests() {
    console.log('[Test] Running Destination Service tests...');

    const orgId = 'test_org';

    // Test 1: lookupRateForDate unit logic
    const rateHistory = [
        { id: '1', rate: 260, startDate: '2026-06-01', endDate: '2026-08-30' },
        { id: '2', rate: 270, startDate: '2026-08-31', endDate: null }
    ];

    const rateInPeriod1 = destinationService.lookupRateForDate(rateHistory, 270, '2026-07-15');
    assert.strictEqual(rateInPeriod1, 260, 'Should return 260 for date inside June 1 - Aug 30 period');

    const rateInPeriod2 = destinationService.lookupRateForDate(rateHistory, 270, '2026-09-01');
    assert.strictEqual(rateInPeriod2, 270, 'Should return 270 for date in Aug 31 onward period');

    const rateBeforePeriod = destinationService.lookupRateForDate(rateHistory, 270, '2026-05-15');
    assert.strictEqual(rateBeforePeriod, 270, 'Should fallback to currentRate for date before history');

    // Test 2: Create Destination
    const destName = 'REWARI_TEST_' + Date.now();
    const created = await destinationService.createDestination(orgId, {
        name: destName,
        rate: 260,
        startDate: '2026-06-01',
        endDate: '2026-08-30'
    });

    assert.strictEqual(created.name, destName);
    assert.strictEqual(created.currentRate, 260);

    // Test 3: Add new Rate Period
    const updated = await destinationService.addRatePeriod(orgId, created.id, {
        rate: 270,
        startDate: '2026-08-31',
        endDate: null
    });

    assert.strictEqual(updated.currentRate, 270);
    assert.strictEqual(updated.rateHistory.length, 2);

    // Test 4: Rate Lookup for Date via service
    const rateForJuly = await destinationService.getRateForDate(orgId, destName, '2026-07-20');
    assert.strictEqual(rateForJuly, 260, 'Service rate lookup for July 2026 should be 260');

    const rateForSept = await destinationService.getRateForDate(orgId, destName, '2026-09-10');
    assert.strictEqual(rateForSept, 270, 'Service rate lookup for Sept 2026 should be 270');

    // Test 5: Auto-record Destination
    const autoRec = await destinationService.autoRecordDestination(orgId, {
        name: 'AUTO_DEST_' + Date.now(),
        rate: 300,
        date: '2026-08-11'
    });
    assert.ok(autoRec, 'Should auto-record new destination');
    assert.strictEqual(autoRec.currentRate, 300);

    // Test 6: Sync destinations from vouchers
    const voucherService = require('../services/voucherService');
    const syncDestName = 'SYNC_DEST_' + Date.now();
    await voucherService.createVoucher(orgId, {
        type: 'test_type',
        destination: syncDestName,
        rate: 350,
        date: '2026-08-12'
    });

    // Delete auto-recorded entry to simulate pre-existing unsynced voucher
    const beforeSyncAll = await destinationService.getAllDestinations(orgId, { autoSync: false });
    const autoCreated = beforeSyncAll.find(d => d.name === syncDestName);
    if (autoCreated) {
        await destinationService.deleteDestination(autoCreated.id);
    }

    const syncRes = await destinationService.syncDestinationsFromVouchers(orgId);
    assert.ok(syncRes.syncedCount >= 1, 'Should sync at least 1 destination from voucher');
    
    const syncedAll = await destinationService.getAllDestinations(orgId, { autoSync: false });
    const foundSync = syncedAll.find(d => d.name === syncDestName);
    assert.ok(foundSync, 'Synced destination should exist in master list');
    assert.strictEqual(foundSync.currentRate, 350);

    // Clean up
    if (created.id) await destinationService.deleteDestination(created.id);
    if (autoRec.id) await destinationService.deleteDestination(autoRec.id);
    if (foundSync && foundSync.id) await destinationService.deleteDestination(foundSync.id);

    console.log('✅ Destination Service tests PASSED!');
}

runTests().catch(err => {
    console.error('❌ Destination tests FAILED:', err);
    process.exit(1);
});
