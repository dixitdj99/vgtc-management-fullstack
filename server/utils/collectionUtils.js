const { getEnvPrefix } = require('./envConfig');

/**
 * Resolves the Firestore collection name using three isolation layers:
 *
 *  Layer 1 — Environment prefix (from APP_ENV):
 *    local       → 'dev_'
 *    beta        → 'beta_'
 *    production  → '' (no prefix)
 *
 *  Layer 2 — Organization prefix (from JWT orgId):
 *    orgId set   → 'org_{orgId}_'
 *    orgId unset → '' (legacy / superadmin)
 *
 *  Layer 3 — Sandbox user prefix (from JWT isSandbox flag):
 *    isSandbox true  → 'test_'
 *    isSandbox false → '' (no extra prefix)
 *
 * Resulting collection examples:
 *  Local  + VGTC org + Normal  → dev_org_vgtc_loading_receipts
 *  Local  + VGTC org + Sandbox → dev_org_vgtc_test_loading_receipts
 *  Prod   + ACME org + Normal  → org_acme_loading_receipts
 *  Prod   + No org   + Normal  → loading_receipts (legacy/superadmin)
 */
const getCol = (baseCol, req) => {
    const envPrefix = getEnvPrefix();                          // 'dev_' | 'beta_' | ''
    const orgId = req?.user?.orgId;
    const orgPrefix = orgId ? `org_${orgId}_` : '';
    const isSandbox = req?.user?.isSandbox;
    const sandboxPrefix = isSandbox ? 'test_' : '';
    return `${envPrefix}${orgPrefix}${sandboxPrefix}${baseCol}`;
};

/**
 * Applies only the environment prefix. Correct for collections like 'users'
 * or internal metadata that shouldn't be affected by the sandbox or org flag.
 */
const getEnvCol = (baseCol) => {
    return `${getEnvPrefix()}${baseCol}`;
};

/**
 * Org-scoped collection without sandbox prefix.
 * For org-level data that isn't per-user-sandbox.
 */
const getOrgCol = (baseCol, orgId) => {
    const envPrefix = getEnvPrefix();
    const orgPrefix = orgId ? `org_${orgId}_` : '';
    return `${envPrefix}${orgPrefix}${baseCol}`;
};

module.exports = { getCol, getEnvCol, getOrgCol };

