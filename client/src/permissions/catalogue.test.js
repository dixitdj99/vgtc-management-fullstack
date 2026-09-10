/**
 * Run: node client/src/permissions/catalogue.test.js
 *
 * Plain node — client/package.json is type:module, so no runner is needed.
 *
 * What this guards: the editor renders each permission key exactly once, split
 * between the company-wide list and the per-location lists. It used to walk the
 * location groups verbatim, so `pay`, `vehicle`, `attendance` and five others
 * appeared four times over — once under each location, every copy bound to the
 * same single value on the user record. Flipping one appeared to flip three
 * others, and a location's "All view" silently rewrote what the rest showed.
 *
 * The split is half derived (isSharedKey) and half hand-written (SHARED_GROUPS).
 * If those drift, a module either vanishes from the editor entirely or comes
 * back duplicated, and neither is visible until someone tries to grant it.
 */
import {
  MODULES, CURRENT_MODULES, LEGACY_MODULES, LOCATIONS, LOCATION_SECTIONS,
  SHARED_GROUPS, SHARED_KEYS, isSharedKey, locationsForKey, locationOwnKeys,
  summarise, moduleLabel, moduleHint,
} from './catalogue.js';

let passed = 0, failed = 0;

function check(label, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { passed++; console.log(`ok    ${label}`); }
  else { failed++; console.log(`FAIL  ${label}\n        expected ${e}\n        actual   ${a}`); }
}

const sorted = (xs) => [...xs].sort();

// ── The derived split and the hand-written one agree ────────────────────────
{
  const derivedShared = CURRENT_MODULES.map(m => m.key).filter(isSharedKey);
  check('SHARED_GROUPS lists exactly the keys offered by more than one location',
    sorted(SHARED_KEYS), sorted(derivedShared));

  check('SHARED_GROUPS has no duplicate keys of its own',
    SHARED_KEYS.length, new Set(SHARED_KEYS).size);
}

// ── Every current key is reachable, exactly once ────────────────────────────
{
  const rendered = [
    ...SHARED_GROUPS.flatMap(g => g.modules),
    ...LOCATION_SECTIONS.flatMap(locationOwnKeys),
  ];

  check('no key is rendered twice', rendered.length, new Set(rendered).size);

  const missing = CURRENT_MODULES.map(m => m.key).filter(k => !rendered.includes(k));
  check('every current module is rendered somewhere', missing, []);

  const unknown = rendered.filter(k => !MODULES.some(m => m.key === k));
  check('nothing rendered is outside the catalogue', unknown, []);

  const legacyLeak = rendered.filter(k => LEGACY_MODULES.some(m => m.key === k));
  check('legacy keys stay out of the main sections', legacyLeak, []);
}

// ── The eight known company-wide keys ───────────────────────────────────────
{
  check('the company-wide set is what the plants actually share',
    sorted(SHARED_KEYS),
    sorted(['lr_dump', 'vehicle', 'mileage', 'attendance', 'loading_status', 'pay', 'balance_all', 'sell']));

  check('lr_dump covers the three JK Super dumps',
    sorted(locationsForKey('lr_dump')),
    sorted(['Kosli Dump', 'Jhajjar Dump', 'Bahadurgarh Dump']));

  check('cashbook stays with Jharli only', locationsForKey('cashbook'), ['Jharli Dump & Plant']);
  check('cashbook is not treated as shared', isSharedKey('cashbook'), false);
  check('pay is treated as shared', isSharedKey('pay'), true);
}

// ── Locations keep their own modules ────────────────────────────────────────
{
  const kosli = LOCATION_SECTIONS.find(l => l.id === 'kosli');
  check('Kosli keeps only its own three modules',
    sorted(locationOwnKeys(kosli)),
    sorted(['bill_kosli', 'balance_kosli', 'stock_kosli']));

  const jharli = LOCATION_SECTIONS.find(l => l.id === 'jharli');
  check('Jharli keeps its plant modules plus cash and fuel',
    sorted(locationOwnKeys(jharli)),
    sorted([
      'voucher_jkl_dump', 'balance_jkl_dump', 'stock_jkl',
      'lr_jkl', 'voucher_jkl', 'balance_jkl',
      'voucher_jksuper', 'balance_jksuper',
      'cashbook', 'diesel',
    ]));

  // Generate Invoice is shelved — no nav entry, so no grant either.
  check('invoice is not offered anywhere', MODULES.some(m => m.key === 'invoice'), false);

  check('every location still has at least one group',
    LOCATION_SECTIONS.filter(l => l.groups.length === 0).map(l => l.id), []);

  check('no group survives empty',
    LOCATION_SECTIONS.flatMap(l => l.groups).filter(g => g.modules.length === 0).map(g => g.id), []);

  check('LOCATIONS itself is untouched — the nav still reads plant and godown keys',
    LOCATIONS.map(l => [l.id, l.plantKey, l.godownKey || null]),
    [
      ['jharli', 'jklakshmi', null],
      ['kosli', 'jksuper', 'kosli'],
      ['jhajjar', 'jksuper', 'jhajjar'],
      ['bahadurgarh', 'jksuper', 'bahadurgarh'],
    ]);
}

// ── Labels and hints ────────────────────────────────────────────────────────
{
  const hintless = CURRENT_MODULES.filter(m => !m.hint).map(m => m.key);
  check('every current module has a description for the editor to show', hintless, []);

  check('moduleLabel falls back to the key', moduleLabel('not_a_module'), 'not_a_module');
  check('moduleHint is empty rather than undefined', moduleHint('not_a_module'), '');
}

// ── summarise counts unique keys, not rendered rows ─────────────────────────
{
  check('an empty grant summarises to nothing',
    summarise({}), { granted: 0, writable: 0, total: CURRENT_MODULES.length });

  check('view counts as granted but not writable',
    summarise({ pay: 'view', cashbook: 'view' }).writable, 0);

  check('edit and delete both count as writable',
    summarise({ pay: 'edit', cashbook: 'delete' }),
    { granted: 2, writable: 2, total: CURRENT_MODULES.length });

  check('a shared key is counted once, not once per location',
    summarise({ pay: 'edit' }).granted, 1);

  check('scoping to a location only counts that location',
    summarise({ bill_kosli: 'edit', cashbook: 'edit' }, locationOwnKeys(LOCATION_SECTIONS.find(l => l.id === 'kosli'))),
    { granted: 1, writable: 1, total: 3 });
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
