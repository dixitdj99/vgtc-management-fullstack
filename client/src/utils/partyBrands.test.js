/**
 * Run: node client/src/utils/partyBrands.test.js
 * The mapping every form leans on to decide which parties it may suggest.
 */
import { brandOfLr, brandOfType, partyVisibleIn, PARTY_BRANDS } from './partyBrands.js';

let passed = 0, failed = 0;
const check = (label, actual, expected) => {
    const a = JSON.stringify(actual), e = JSON.stringify(expected);
    if (a === e) { passed++; console.log(`ok    ${label}`); }
    else { failed++; console.log(`FAIL  ${label} — expected ${e}, got ${a}`); }
};

// ── LR brand mapping ────────────────────────────────────────────────────────
check('jkl LRs are JK Lakshmi', brandOfLr('jkl'), 'jklakshmi');
check('kosli LRs are JK Super', brandOfLr('kosli'), 'jksuper');
check('jhajjar LRs are JK Super', brandOfLr('jhajjar'), 'jksuper');
check('bahadurgarh LRs are JK Super', brandOfLr('bahadurgarh'), 'jksuper');
check('generic orgs have no split', brandOfLr('main'), null);
check('unknown brand has no split', brandOfLr('whatever'), null);
check('missing brand has no split', brandOfLr(undefined), null);

// ── Voucher / sheet type mapping ────────────────────────────────────────────
check('JK_Lakshmi type', brandOfType('JK_Lakshmi'), 'jklakshmi');
check('JKL Dump sheet is JK Lakshmi side', brandOfType('Dump'), 'jklakshmi');
check('JK_Super type', brandOfType('JK_Super'), 'jksuper');
check('Kosli_Bill is JK Super side', brandOfType('Kosli_Bill'), 'jksuper');
check('Jajjhar_Bill is JK Super side', brandOfType('Jajjhar_Bill'), 'jksuper');
check('Bahadurgarh_Bill is JK Super side', brandOfType('Bahadurgarh_Bill'), 'jksuper');
check('main type has no split', brandOfType('main'), null);

// ── Visibility ──────────────────────────────────────────────────────────────
const jkl = { name: 'A', brands: ['jklakshmi'] };
const both = { name: 'B', brands: ['jklakshmi', 'jksuper'] };
const untagged = { name: 'C' };
const emptyTag = { name: 'D', brands: [] };

check('tagged party shows in its own group', partyVisibleIn(jkl, 'jklakshmi'), true);
check('tagged party hidden from the other group', partyVisibleIn(jkl, 'jksuper'), false);
check('both-ticked party shows in JKL', partyVisibleIn(both, 'jklakshmi'), true);
check('both-ticked party shows in JKS', partyVisibleIn(both, 'jksuper'), true);
check('untagged party shows everywhere', partyVisibleIn(untagged, 'jksuper'), true);
check('empty brands behaves as untagged', partyVisibleIn(emptyTag, 'jklakshmi'), true);
check('no group (generic org) sees everything', partyVisibleIn(jkl, null), true);
check('a null party does not crash the filter', partyVisibleIn(null, 'jksuper'), true);

// ── Every declared group id is reachable from the mappings ──────────────────
{
    const reachable = new Set([
        brandOfLr('jkl'), brandOfLr('kosli'),
        brandOfType('JK_Lakshmi'), brandOfType('JK_Super'),
    ]);
    check('no orphan group ids', PARTY_BRANDS.every(b => reachable.has(b.id)), true);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
