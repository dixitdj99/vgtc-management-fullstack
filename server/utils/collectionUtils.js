/**
 * Utility to isolate database collections for Sandbox/Test accounts.
 * If the user is a sandbox user, the collection name is prefixed with 'test_'.
 */
const getCol = (baseCol, req) => {
    if (req.user && req.user.isSandbox) {
        return `test_${baseCol}`;
    }
    return baseCol;
};

module.exports = { getCol };
