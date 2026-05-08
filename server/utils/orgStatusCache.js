/**
 * In-memory cache for org config to avoid hitting Firestore on every request.
 * TTL: 60 seconds. Used by auth middleware and permission middleware.
 */
const orgService = require('../services/orgService');

const cache = new Map();
const TTL = 60_000; // 60 seconds

const getOrgCached = async (orgId) => {
    const id = orgId || 'vgtc';
    const cached = cache.get(id);
    if (cached && Date.now() - cached.timestamp < TTL) return cached.data;

    const org = await orgService.getById(id);
    if (org) cache.set(id, { data: org, timestamp: Date.now() });
    return org;
};

const invalidate = (orgId) => {
    if (orgId) cache.delete(orgId);
    else cache.clear();
};

module.exports = { getOrgCached, invalidate };
