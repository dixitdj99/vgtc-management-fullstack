/**
 * partyBrands.js — which party list a party belongs to.
 *
 * JK Lakshmi and JK Super trade with different parties, so each keeps its own
 * list. Kosli, Jajjhar and Bahadurgarh sell JK Super cement — they ARE the
 * JK Super side, not lists of their own. A dealer who buys both is one party
 * record carrying both group ids.
 *
 * A party with no `brands` is visible everywhere. That keeps every pre-split
 * party working until the backfill or a human tags it — a name silently
 * missing from the suggestion box is far harder to diagnose than a stray
 * extra suggestion.
 *
 * Mirrored in server/utils/partyBrands.js (CommonJS) — the repo has no shared
 * client/server module. Change both together.
 */

export const PARTY_BRANDS = [
    { id: 'jklakshmi', label: 'JK Lakshmi' },
    { id: 'jksuper', label: 'JK Super' },
];

/** LRModule `brand` prop -> party group. 'main' and unknown -> null (no split). */
export function brandOfLr(lrBrand) {
    if (lrBrand === 'jkl') return 'jklakshmi';
    if (lrBrand === 'kosli' || lrBrand === 'jhajjar' || lrBrand === 'bahadurgarh') return 'jksuper';
    return null;
}

/** Voucher / balance-sheet type -> party group. 'main' and unknown -> null. */
export function brandOfType(type) {
    if (type === 'JK_Lakshmi' || type === 'Dump') return 'jklakshmi';
    if (type === 'JK_Super' || type === 'Kosli_Bill' || type === 'Jajjhar_Bill' || type === 'Bahadurgarh_Bill') return 'jksuper';
    return null;
}

/**
 * Should `party` be offered in `group`?
 * No group (a generic org) sees everything; an untagged party appears
 * everywhere; otherwise membership decides.
 */
export function partyVisibleIn(party, group) {
    if (!group) return true;
    const brands = Array.isArray(party?.brands) ? party.brands : [];
    if (!brands.length) return true;
    return brands.includes(group);
}
