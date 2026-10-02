const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeDestinationName, destinationKey } = require('../services/destinationService');
const { buildPartyLedger, normalizePayload } = require('../services/partyService');
const destinationService = require('../services/destinationService');
const { autoRecordFromVoucher } = require('../services/voucherService');

test('destination matching folds spaces, case, and punctuation', () => {
    assert.equal(normalizeDestinationName('  New   Delhi  '), 'NEW DELHI');
    assert.equal(destinationKey('New-Delhi'), destinationKey(' new  delhi '));
});

test('party ledger includes receipts across godowns and matching bills', () => {
    const party = { id: 'party-1', name: 'ABC Transport' };
    const names = ['dev_vouchers', 'dev_loading_receipts', 'dev_jkl_loading_receipts',
        'dev_kosli_loading_receipts', 'dev_jhajjar_loading_receipts', 'dev_bahadurgarh_loading_receipts'];
    const lists = [
        [
            { id: 'bill-1', partyName: ' abc  transport ', date: '2026-09-02', deliveries: [{ weight: 5, rate: 100 }] },
            { id: 'other-bill', partyName: 'Other', date: '2026-09-03' }
        ],
        [], [],
        [{ id: 'lr-k', partyId: 'party-1', date: '2026-09-02' }],
        [{ id: 'lr-j', partyName: 'ABC TRANSPORT', date: '2026-09-04' }],
        [{ id: 'lr-b', partyName: 'Other', date: '2026-09-05' }]
    ];
    const ledger = buildPartyLedger(party, names, lists);
    assert.deepEqual(ledger.vouchers.map(item => item.id), ['bill-1']);
    assert.deepEqual(ledger.lrs.map(item => item.id), ['lr-j', 'lr-k']);
    assert.equal(ledger.lrs[0].collection, 'dev_jhajjar_loading_receipts');
    assert.equal(ledger.summary.totalNet, 500);
    assert.equal(ledger.summary.lastActivity, '2026-09-04');
});

test('shared multi-party bill appears once for each delivery party', () => {
    const names = ['dev_vouchers', 'dev_loading_receipts'];
    const lists = [[{
        id: 'shared-bill', partyName: 'Sender',
        deliveries: [
            { partyName: 'Party A', weight: 2, rate: 100 },
            { partyName: 'Party B', weight: 3, rate: 100 },
            { partyName: 'Party A', weight: 1, rate: 100 }
        ]
    }], []];
    const partyA = buildPartyLedger({ id: 'a', name: 'Party A' }, names, lists);
    const partyB = buildPartyLedger({ id: 'b', name: 'Party B' }, names, lists);
    assert.deepEqual(partyA.vouchers.map(item => item.id), ['shared-bill']);
    assert.deepEqual(partyB.vouchers.map(item => item.id), ['shared-bill']);
});

test('party code is normalized on party profile, not on destination', () => {
    const party = normalizePayload({ name: '  A B  ', partyCode: '  p-10  ' });
    assert.equal(party.name, 'A B');
    assert.equal(party.partyCode, 'P-10');
    const destination = destinationService.normalizeDestination({ name: ' rewari ', partyCode: 'OLD' });
    assert.equal(destination.name, 'REWARI');
    assert.equal(Object.hasOwn(destination, 'partyCode'), false);
});

test('voucher destination hook does not copy party codes to destinations', async () => {
    const original = destinationService.autoRecordDestination;
    const calls = [];
    destinationService.autoRecordDestination = async (_orgId, payload) => { calls.push(payload); };
    try {
        await autoRecordFromVoucher('org-1', {
            partyName: 'Sender', partyCode: 'HEAD', date: '2026-09-02',
            deliveries: [
                { destination: 'Rewari', partyName: 'Sender', rate: 100 },
                { destination: 'Kosli', partyName: 'Other', partyCode: 'OTHER', rate: 120 },
                { destination: 'Jhajjar', partyName: 'Other', rate: 130 }
            ]
        });
        assert.equal(calls.length, 3);
        assert(calls.every(call => !Object.hasOwn(call, 'partyCode')));
    } finally {
        destinationService.autoRecordDestination = original;
    }
});
