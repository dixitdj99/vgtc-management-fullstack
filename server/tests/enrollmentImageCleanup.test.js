const test = require('node:test');
const assert = require('node:assert/strict');
const deleted = [];
let fail = false;
require.cache[require.resolve('../firebase')] = { exports: {
    isAvailable: () => true,
    admin: { storage: () => ({ bucket: () => ({
        file: name => ({ delete: async () => { if (fail) throw new Error('storage unavailable'); deleted.push(name); } }),
        deleteFiles: async options => { deleted.push(options); },
    }) }) },
} };
const { cleanupEnrollmentImages } = require('../services/enrollmentImageCleanup');
const { getEnvCol } = require('../utils/collectionUtils');
const url = name => `/api/terminal/enrollment-images/p1/${name}`;
test.beforeEach(() => { deleted.length = 0; fail = false; });
test('replacement removes only obsolete owned images and preserves reused gallery image', async () => {
    assert.equal(await cleanupEnrollmentImages('p1', { photos: [url('aaa.jpg'), url('bbb.png'), '/api/terminal/enrollment-images/p2/ccc.jpg', 'https://example.com/image.jpg'] }, { photos: [url('bbb.png'), url('ddd.jpg')] }), true);
    assert.deepEqual(deleted, [`${getEnvCol('enrollment')}/p1/aaa.jpg`]);
});
test('profile deletion removes only exact owned prefix including abandoned uploads', async () => {
    assert.equal(await cleanupEnrollmentImages('p1', {}, {}, { all: true }), true);
    assert.deepEqual(deleted, [{ prefix: `${getEnvCol('enrollment')}/p1/` }]);
    assert.equal(await cleanupEnrollmentImages('../p1', {}, {}, { all: true }), false);
    assert.equal(deleted.length, 1);
});
test('storage failure does not undo successful metadata update or throw', async () => {
    fail = true;
    assert.equal(await cleanupEnrollmentImages('p1', { photo: url('aaa.jpg') }, {}), false);
});
