const fs = require('fs');
const path = require('path');
const { admin, isAvailable } = require('../firebase');
const { getEnvCol } = require('../utils/collectionUtils');
const IMAGE_DIR = path.resolve(__dirname, '..', 'data', 'enrollment');
const validId = id => typeof id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(id);
const photoNames = (profileId, profile = {}) => {
    const prefix = `/api/terminal/enrollment-images/${profileId}/`;
    return new Set([...(Array.isArray(profile.photos) ? profile.photos : []), profile.photo, profile.facePhoto, profile.photoUrl]
        .filter(url => typeof url === 'string' && url.startsWith(prefix))
        .map(url => url.slice(prefix.length)).filter(name => /^[a-f0-9-]+\.(jpg|png)$/.test(name)));
};

// Call only after the profile write/delete commits. Never remove arbitrary URLs
// or files supplied by a caller. Failures leave private objects for later retry.
async function cleanupEnrollmentImages(profileId, previous, current, { all = false } = {}) {
    if (!validId(profileId)) return false;
    try {
        const keep = photoNames(profileId, current);
        const obsolete = [...photoNames(profileId, previous)].filter(name => !keep.has(name));
        let bucket = null;
        if (isAvailable()) {
            try {
                bucket = admin.storage().bucket(process.env.FIREBASE_STORAGE_BUCKET || undefined);
            } catch (_e) {
                bucket = null;
            }
        }
        if (bucket) {
            const prefix = `${getEnvCol('enrollment')}/${profileId}/`;
            if (all) await bucket.deleteFiles({ prefix });
            else await Promise.all(obsolete.map(name => bucket.file(prefix + name).delete({ ignoreNotFound: true })));
        } else {
            const directory = path.resolve(IMAGE_DIR, profileId);
            if (!directory.startsWith(IMAGE_DIR + path.sep)) throw new Error('Unsafe enrollment cleanup path');
            if (all) await fs.promises.rm(directory, { recursive: true, force: true });
            else await Promise.all(obsolete.map(name => fs.promises.rm(path.join(directory, name), { force: true })));
        }
        return true;
    } catch (error) {
        console.error(`[EnrollmentImages] Cleanup failed after profile commit for ${profileId}; private objects retained:`, error.message);
        return false;
    }
}
module.exports = { cleanupEnrollmentImages };
