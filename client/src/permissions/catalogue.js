/**
 * catalogue.js — the one list of permission keys an admin can grant.
 *
 * There used to be three copies of this: AdminPage.jsx, AdminUserManagement.jsx
 * and the dead OrganizationSettings.jsx. They had already drifted apart and away
 * from the app itself:
 *
 *   - `attendance` was enforced by the app but missing from AdminPage, so it
 *     could not be granted there at all
 *   - `lr_dump` was missing from BOTH screens, so JK Super Loading Receipt was
 *     ungrantable except through a legacy fallback
 *   - `lr_kosli` / `lr_jhajjar` / `lr_bahadurgarh` were listed as if current,
 *     while the nav stopped using them
 *
 * Every key here must match a `permKey` in the NAV list in App.jsx, or be
 * marked `legacy`. `assertCatalogueMatchesNav` below checks that in development
 * so the next module added cannot quietly go missing.
 */

/** Permission levels, weakest first. Mirrors PERMISSION_LADDER in server/middleware/auth.js. */
export const LEVELS = [
  { value: '', label: 'None', short: '—', color: 'var(--text-muted)', hint: 'Module is hidden' },
  { value: 'view', label: 'View', short: 'V', color: '#6366f1', hint: 'Can open and read' },
  { value: 'edit', label: 'Edit', short: 'E', color: '#10b981', hint: 'Can create and change' },
  { value: 'delete', label: 'Delete', short: 'D', color: '#f43f5e', hint: 'Can also delete records' },
];

export const LEVEL_VALUES = LEVELS.map(l => l.value);

/**
 * Locations mirror the plant/godown split the nav enforces. `plantKey` and
 * `godownKey` are what get written into allowedPlants / allowedGodowns.
 */
/**
 * What the three JK Super dumps offer.
 *
 * Cashbook and Diesel Control are gone: those modules are hidden at Kosli,
 * Jhajjar and Bahadurgarh (see HIDDEN_AT_DUMP_GODOWNS in App.jsx) and nothing
 * that remains reads through their APIs, so offering the permission would grant
 * a screen the user cannot reach.
 *
 * `vehicle`, `mileage` and `pay` stay, even though their modules are hidden too,
 * because the screens that remain depend on them and revoking would break real
 * work rather than tidy the menu:
 *   vehicle  — the truck list on every LR, voucher and balance sheet, market
 *              vehicles included; also Fleet Dashboard, which is still shown
 *   mileage  — the voucher form's last-odometer lookup, /mileage/last-km
 *   pay      — the freight batches a balance sheet reads, and Vehicle Credit
 *              & Debit, which is still shown
 */
const DUMP_SHARED = ['pay', 'balance_all', 'vehicle', 'mileage', 'sell', 'attendance', 'loading_status'];

export const LOCATIONS = [
  {
    id: 'jharli',
    label: 'Jharli Dump & Plant',
    color: '#f59e0b',
    plantKey: 'jklakshmi',
    groups: [
      { id: 'jkl_dump', label: 'JK Lakshmi Dump', modules: ['voucher_jkl_dump', 'balance_jkl_dump', 'stock_jkl'] },
      { id: 'jkl_factory', label: 'JK Lakshmi Factory', modules: ['lr_jkl', 'voucher_jkl', 'balance_jkl'] },
      { id: 'jksuper_factory', label: 'JK Super Factory', modules: ['voucher_jksuper', 'balance_jksuper'] },
      // Cashbook and Diesel are offered here and nowhere else — they are hidden
      // at the three dump godowns. The rest of this row is company-wide and now
      // lives in SHARED_GROUPS instead of being repeated per location.
      { id: 'jharli_shared', label: 'Cash & Fuel', modules: ['cashbook', 'pay', 'balance_all', 'vehicle', 'diesel', 'mileage', 'sell', 'attendance', 'loading_status'] },
    ],
  },
  {
    id: 'kosli',
    label: 'Kosli Dump',
    color: '#6366f1',
    plantKey: 'jksuper',
    godownKey: 'kosli',
    groups: [
      { id: 'kosli_plant', label: 'Kosli Plant Modules', modules: ['lr_dump', 'bill_kosli', 'balance_kosli', 'stock_kosli'] },
      { id: 'kosli_shared', label: 'Shared Utilities', modules: DUMP_SHARED },
    ],
  },
  {
    id: 'jhajjar',
    label: 'Jhajjar Dump',
    color: '#14b8a6',
    plantKey: 'jksuper',
    godownKey: 'jhajjar',
    groups: [
      { id: 'jhajjar_plant', label: 'Jhajjar Plant Modules', modules: ['lr_dump', 'bill_jhajjar', 'balance_jhajjar', 'stock_jhajjar'] },
      { id: 'jhajjar_shared', label: 'Shared Utilities', modules: DUMP_SHARED },
    ],
  },
  {
    id: 'bahadurgarh',
    label: 'Bahadurgarh Dump',
    color: '#d97706',
    plantKey: 'jksuper',
    godownKey: 'bahadurgarh',
    groups: [
      { id: 'bahadurgarh_plant', label: 'Bahadurgarh Plant Modules', modules: ['lr_dump', 'bill_bahadurgarh', 'balance_bahadurgarh', 'stock_bahadurgarh'] },
      { id: 'bahadurgarh_shared', label: 'Shared Utilities', modules: DUMP_SHARED },
    ],
  },
];

/**
 * Every grantable module. `legacy` keys are still read by older code paths.
 *
 * Every current key carries a `hint`. The editor shows one line of plain
 * English under each name, because "Balance — JK Super" tells an admin which
 * screen it unlocks but not what the person on the other end will be able to
 * see once they have it.
 */
export const MODULES = [
  { key: 'lr_dump', label: 'Loading Receipt', hint: 'Raise and track LRs at the JK Super dumps' },
  { key: 'lr_jkl', label: 'Loading Receipt', hint: 'Raise and track LRs at the JK Lakshmi factory' },
  { key: 'bill_kosli', label: 'Kosli Bill', hint: 'Party bills raised against Kosli loadings' },
  { key: 'bill_jhajjar', label: 'Jhajjar Bill', hint: 'Party bills raised against Jhajjar loadings' },
  { key: 'bill_bahadurgarh', label: 'Bahadurgarh Bill', hint: 'Party bills raised against Bahadurgarh loadings' },
  { key: 'voucher_jkl_dump', label: 'JKL Dump Voucher', hint: 'Trip vouchers for the JK Lakshmi dump' },
  { key: 'voucher_jkl', label: 'JK Lakshmi Voucher', hint: 'Trip vouchers for the JK Lakshmi factory' },
  { key: 'voucher_jksuper', label: 'JK Super Voucher', hint: 'Trip vouchers for the JK Super factory' },
  { key: 'balance_kosli', label: 'Balance — Kosli', hint: 'Party and vehicle balances at Kosli' },
  { key: 'balance_jhajjar', label: 'Balance — Jhajjar', hint: 'Party and vehicle balances at Jhajjar' },
  { key: 'balance_bahadurgarh', label: 'Balance — Bahadurgarh', hint: 'Party and vehicle balances at Bahadurgarh' },
  { key: 'balance_jksuper', label: 'Balance — JK Super', hint: 'Party and vehicle balances for the JK Super factory' },
  { key: 'balance_jkl_dump', label: 'Balance — JKL Dump', hint: 'Party and vehicle balances for the JK Lakshmi dump' },
  { key: 'balance_jkl', label: 'Balance — JK Lakshmi', hint: 'Party and vehicle balances for the JK Lakshmi factory' },
  // Grants the combined read-across screen, not the plants on it: rows are still
  // limited to the balance_* keys above, so this alone shows an empty sheet.
  {
    key: 'balance_all',
    label: 'Balance — All Plants',
    hint: 'The combined sheet only. Rows still come from the per-plant balance grants above',
  },
  { key: 'stock_kosli', label: 'Kosli Stock', hint: 'Opening, inward and closing stock at Kosli' },
  { key: 'stock_jhajjar', label: 'Jhajjar Stock', hint: 'Opening, inward and closing stock at Jhajjar' },
  { key: 'stock_bahadurgarh', label: 'Bahadurgarh Stock', hint: 'Opening, inward and closing stock at Bahadurgarh' },
  { key: 'stock_jkl', label: 'JK Lakshmi Stock', hint: 'Opening, inward and closing stock at JK Lakshmi' },
  { key: 'cashbook', label: 'Cashbook', hint: 'Daily cash receipts and payments' },
  { key: 'pay', label: 'Pay & Freight', hint: 'Freight batches, vehicle credit/debit and trip profit' },
  // `invoice` is deliberately absent. Generate Invoice is shelved: its nav
  // entries and render branches are gone from App.jsx, so offering the grant
  // would hand out access to a screen nobody can reach. The server route and
  // modules/InvoiceModule.jsx both stay, and any account still carrying an
  // `invoice` grant keeps it untouched — put the key back here and in the
  // jharli_shared group above to bring the module back.
  { key: 'vehicle', label: 'Fleet', hint: 'Vehicles, tyres, maintenance and market vehicles' },
  { key: 'diesel', label: 'Diesel Control', hint: 'Fuel issues, pump ledgers and diesel rates' },
  { key: 'mileage', label: 'Mileage Tracker', hint: 'Odometer readings and kilometres per litre' },
  { key: 'sell', label: 'Sell', hint: 'Material sale entries and the buyer ledger' },
  { key: 'attendance', label: 'Attendance', hint: 'Daily driver and staff roll-call' },
  { key: 'loading_status', label: 'Loading Realtime', hint: 'Live loading board fed by the labour portal' },

  // Superseded by lr_dump when the three JK Super LR screens merged into one.
  // Still read as a fallback in App.jsx and for edit rights in LRModule.jsx,
  // so they are shown — separately — rather than silently dropped.
  { key: 'lr_kosli', label: 'Kosli LR', hint: 'Old per-dump LR key', legacy: true, supersededBy: 'lr_dump' },
  { key: 'lr_jhajjar', label: 'Jhajjar LR', hint: 'Old per-dump LR key', legacy: true, supersededBy: 'lr_dump' },
  { key: 'lr_bahadurgarh', label: 'Bahadurgarh LR', hint: 'Old per-dump LR key', legacy: true, supersededBy: 'lr_dump' },
];

export const MODULE_BY_KEY = Object.fromEntries(MODULES.map(m => [m.key, m]));
export const CURRENT_MODULES = MODULES.filter(m => !m.legacy);
export const LEGACY_MODULES = MODULES.filter(m => m.legacy);

export const moduleLabel = (key) => MODULE_BY_KEY[key]?.label || key;
export const moduleHint = (key) => MODULE_BY_KEY[key]?.hint || '';

/* ────────────────────── Shared vs location-specific ──────────────────────
 *
 * A permission key is global: `pay` is one value on the user record, not one
 * per plant. The editor used to render the location groups verbatim, so `pay`,
 * `vehicle`, `attendance` and five others appeared four times — once under each
 * location — all wired to the same value. Flipping one flipped all four, and
 * a location's "All view" button silently rewrote what the other three showed.
 *
 * So the catalogue now says which keys belong to one location and which are
 * company-wide, and the editor renders each key exactly once.
 */

/** locationId list per module key, derived from LOCATIONS. */
const LOCATION_IDS_BY_KEY = (() => {
  const map = {};
  LOCATIONS.forEach(loc => loc.groups.forEach(g => g.modules.forEach(key => {
    if (!map[key]) map[key] = [];
    if (!map[key].includes(loc.id)) map[key].push(loc.id);
  })));
  return map;
})();

/** True when a key is offered by more than one location, so it is company-wide. */
export const isSharedKey = (key) => (LOCATION_IDS_BY_KEY[key]?.length || 0) > 1;

/** Locations that offer a key, as label strings. */
export const locationsForKey = (key) =>
  (LOCATION_IDS_BY_KEY[key] || []).map(id => LOCATIONS.find(l => l.id === id)?.label || id);

/**
 * The company-wide keys, grouped for reading. `assertCatalogueMatchesNav`
 * checks this covers exactly the keys that isSharedKey reports, so adding a
 * module to a second location without listing it here is caught in dev.
 */
export const SHARED_GROUPS = [
  { id: 'shared_lr', label: 'Loading Receipts', modules: ['lr_dump'] },
  { id: 'shared_fleet', label: 'Fleet & People', modules: ['vehicle', 'mileage', 'attendance', 'loading_status'] },
  { id: 'shared_money', label: 'Money & Trading', modules: ['pay', 'balance_all', 'sell'] },
];

export const SHARED_KEYS = SHARED_GROUPS.flatMap(g => g.modules);

/** LOCATIONS with the company-wide keys removed and empty groups dropped. */
export const LOCATION_SECTIONS = LOCATIONS.map(loc => ({
  ...loc,
  groups: loc.groups
    .map(g => ({ ...g, modules: g.modules.filter(key => !isSharedKey(key)) }))
    .filter(g => g.modules.length > 0),
})).filter(loc => loc.groups.length > 0);

/** Every key a location owns outright — what its bulk buttons and count cover. */
export const locationOwnKeys = (loc) => loc.groups.flatMap(g => g.modules);

/** Count of granted modules and how many of those can write. */
export const summarise = (permissions = {}, keys = CURRENT_MODULES.map(m => m.key)) => {
  let granted = 0, writable = 0;
  keys.forEach(k => {
    const v = permissions[k];
    if (!v) return;
    granted++;
    if (v === 'edit' || v === 'delete') writable++;
  });
  return { granted, writable, total: keys.length };
};

/**
 * Warns when the catalogue and the nav disagree. Called once from the editor in
 * development; the mismatch it reports is exactly the class of bug that left
 * `attendance` and `lr_dump` ungrantable.
 */
export const assertCatalogueMatchesNav = (navPermKeys = []) => {
  if (!import.meta.env?.DEV) return;
  const known = new Set(MODULES.map(m => m.key));
  const missing = [...new Set(navPermKeys)].filter(k => k && !known.has(k));
  const inGroups = new Set(LOCATIONS.flatMap(l => l.groups.flatMap(g => g.modules)));
  const ungrouped = CURRENT_MODULES.filter(m => !inGroups.has(m.key)).map(m => m.key);

  if (missing.length) console.warn('[permissions] nav keys missing from the catalogue:', missing.join(', '));
  if (ungrouped.length) console.warn('[permissions] modules in no location group (unreachable in the editor):', ungrouped.join(', '));

  // SHARED_GROUPS is hand-written; isSharedKey is derived. If they drift, a
  // module either vanishes from the editor or comes back four times over.
  const derived = CURRENT_MODULES.map(m => m.key).filter(isSharedKey);
  const listed = new Set(SHARED_KEYS);
  const notListed = derived.filter(k => !listed.has(k));
  const listedButNotShared = SHARED_KEYS.filter(k => !derived.includes(k));

  if (notListed.length) console.warn('[permissions] shared across locations but missing from SHARED_GROUPS (they will not render):', notListed.join(', '));
  if (listedButNotShared.length) console.warn('[permissions] listed in SHARED_GROUPS but owned by one location (they will render twice):', listedButNotShared.join(', '));
};
