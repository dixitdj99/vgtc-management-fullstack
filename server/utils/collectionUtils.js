const { getEnvPrefix } = require('./envConfig');

/**
 * Resolves the Firestore collection name using two isolation layers:
 *
 *  Layer 1 — Environment prefix (from APP_ENV):
 *    local       → 'dev_'
 *    beta        → 'beta_'
 *    production  → '' (no prefix)
 *
 *  Layer 2 — Sandbox user prefix (from JWT isSandbox flag):
 *    isSandbox true  → 'test_'
 *    isSandbox false → '' (no extra prefix)
 *
 * Resulting collection examples:
 *  Local  + Normal  user → dev_loading_receipts
 *  Local  + Sandbox user → dev_test_loading_receipts
 *  Beta   + Normal  user → beta_loading_receipts
 *  Beta   + Sandbox user → beta_test_loading_receipts
 *  Prod   + Normal  user → loading_receipts
 *  Prod   + Sandbox user → test_loading_receipts
 */
const getCol = (baseCol, req) => {
    const envPrefix = getEnvPrefix();                          // 'dev_' | 'beta_' | ''
    const isSandbox = req?.user?.isSandbox;
    const sandboxPrefix = isSandbox ? 'test_' : '';
    return `${envPrefix}${sandboxPrefix}${baseCol}`;
};

/**
 * Applies only the environment prefix. Correct for collections like 'users'
 * or internal metadata that shouldn't be affected by the sandbox flag.
 */
const getEnvCol = (baseCol) => {
    return `${getEnvPrefix()}${baseCol}`;
};

module.exports = { getCol, getEnvCol };
