const test = require('node:test');
const assert = require('node:assert/strict');
const firebase = require('../firebase');
firebase.isAvailable = () => false;
const localStore = require('../utils/localStore');
const data = new Map();
let seq = 0;
localStore.getAll = collection => data.get(collection) || [];
localStore.getById = (collection, id) => (data.get(collection) || []).find(p => p.id === id);
localStore.insert = (collection, row) => {
    const saved = { id: `party-${++seq}`, ...row };
    data.set(collection, [...(data.get(collection) || []), saved]);
    return saved;
};
localStore.update = (collection, id, patch) => {
    data.set(collection, (data.get(collection) || []).map(p => p.id === id ? { ...p, ...patch } : p));
};
const service = require('../services/partyService');
const scope = { user: { isSandbox: true } };
const org = 'duplicate-test-org';

test('spelling variant and punctuation variant cannot create duplicate party', async () => {
    const first = await service.createParty(org, { name: 'AHLAWAT TRANSPORT', partyCode: 'A-100' }, scope);
    await assert.rejects(() => service.createParty(org, { name: 'ALAWAT TRANSPORT' }, scope), err =>
        err.code === 'SIMILAR_PARTY' && err.match.id === first.id);
    await assert.rejects(() => service.createParty(org, { name: 'M/S. AHLAWAT-TRANSPORT' }, scope), err =>
        err.code === 'SIMILAR_PARTY' && err.match.id === first.id);
    assert.equal((await service.getAllParties(org, scope)).length, 1);
});

test('same party code blocked even when names differ; distinct close name needs explicit override', async () => {
    await assert.rejects(() => service.createParty(org, { name: 'OTHER FIRM', partyCode: 'A-100' }, scope),
        err => err.code === 'DUPLICATE_PARTY_CODE');
    const second = await service.createParty(org, { name: 'ALAWAT TRANSPORT', allowSimilarParty: true }, scope);
    assert.equal(second.name, 'ALAWAT TRANSPORT');
    assert.equal(Object.hasOwn(second, 'allowSimilarParty'), false);
    const third = await service.createParty(org, { name: 'ALWAR TRANSPORT' }, scope);
    assert.equal(third.name, 'ALWAR TRANSPORT');
});

test('renaming or coding a party checks conflicts, ordinary tag update stays possible', async () => {
    const other = await service.createParty(org, { name: 'LONG DISTANCE HAULERS' }, scope);
    await assert.rejects(() => service.updateParty(other.id, { name: 'AHLAWAT TRANSPOR' }, scope),
        err => err.code === 'SIMILAR_PARTY');
    await assert.rejects(() => service.updateParty(other.id, { partyCode: 'A-100' }, scope),
        err => err.code === 'DUPLICATE_PARTY_CODE');
    await service.updateParty(other.id, { brands: ['jklakshmi'] }, scope);
    assert.deepEqual((await service.getAllParties(org, scope)).find(p => p.id === other.id).brands, ['jklakshmi']);
});
