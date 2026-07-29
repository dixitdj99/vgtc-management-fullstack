/**
 * partyBrands.js — server copy of client/src/utils/partyBrands.js.
 *
 * CommonJS mirror; the repo has no module shared between client and server.
 * Change both files together. See the client copy for the reasoning.
 */

const PARTY_BRAND_IDS = ['jklakshmi', 'jksuper'];

/** LR `brand` field -> party group. 'main' and unknown -> null (no split). */
function brandOfLr(lrBrand) {
    if (lrBrand === 'jkl') return 'jklakshmi';
    if (lrBrand === 'kosli' || lrBrand === 'jhajjar' || lrBrand === 'bahadurgarh') return 'jksuper';
    return null;
}

/** Voucher / balance-sheet type -> party group. 'main' and unknown -> null. */
function brandOfType(type) {
    if (type === 'JK_Lakshmi' || type === 'Dump') return 'jklakshmi';
    if (type === 'JK_Super' || type === 'Kosli_Bill' || type === 'Jajjhar_Bill' || type === 'Bahadurgarh_Bill') return 'jksuper';
    return null;
}

/** Keep only known group ids, deduplicated. Junk is dropped, not rejected —
 *  a typo must not make a party invisible somewhere. */
function cleanBrands(value) {
    const arr = Array.isArray(value) ? value : [];
    return [...new Set(arr.filter(b => PARTY_BRAND_IDS.includes(b)))];
}

module.exports = { PARTY_BRAND_IDS, brandOfLr, brandOfType, cleanBrands };
