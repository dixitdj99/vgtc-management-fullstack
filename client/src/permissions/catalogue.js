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
      { id: 'jharli_shared', label: 'Shared Utilities', modules: ['cashbook', 'pay', 'invoice', 'balance_all', 'vehicle', 'diesel', 'mileage', 'sell', 'attendance', 'loading_status'] },
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
      { id: 'kosli_shared', label: 'Shared Utilities', modules: ['cashbook', 'pay', 'invoice', 'balance_all', 'vehicle', 'diesel', 'mileage', 'sell', 'attendance', 'loading_status'] },
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
      { id: 'jhajjar_shared', label: 'Shared Utilities', modules: ['cashbook', 'pay', 'invoice', 'balance_all', 'vehicle', 'diesel', 'mileage', 'sell', 'attendance', 'loading_status'] },
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
      { id: 'bahadurgarh_shared', label: 'Shared Utilities', modules: ['cashbook', 'pay', 'invoice', 'balance_all', 'vehicle', 'diesel', 'mileage', 'sell', 'attendance', 'loading_status'] },
    ],
  },
];

/** Every grantable module. `legacy` keys are still read by older code paths. */
export const MODULES = [
  { key: 'lr_dump', label: 'Loading Receipt', hint: 'JK Super — Kosli, Jhajjar and Bahadurgarh' },
  { key: 'lr_jkl', label: 'Loading Receipt', hint: 'JK Lakshmi' },
  { key: 'bill_kosli', label: 'Kosli Bill' },
  { key: 'bill_jhajjar', label: 'Jhajjar Bill' },
  { key: 'bill_bahadurgarh', label: 'Bahadurgarh Bill' },
  { key: 'voucher_jkl_dump', label: 'JKL Dump Voucher' },
  { key: 'voucher_jkl', label: 'JK Lakshmi Voucher' },
  { key: 'voucher_jksuper', label: 'JK Super Voucher' },
  { key: 'balance_kosli', label: 'Balance — Kosli' },
  { key: 'balance_jhajjar', label: 'Balance — Jhajjar' },
  { key: 'balance_bahadurgarh', label: 'Balance — Bahadurgarh' },
  { key: 'balance_jksuper', label: 'Balance — JK Super' },
  { key: 'balance_jkl_dump', label: 'Balance — JKL Dump' },
  { key: 'balance_jkl', label: 'Balance — JK Lakshmi' },
  // Grants the combined read-across screen, not the plants on it: rows are still
  // limited to the balance_* keys above, so this alone shows an empty sheet.
  { key: 'balance_all', label: 'Balance — All Plants (combined)' },
  { key: 'stock_kosli', label: 'Kosli Stock' },
  { key: 'stock_jhajjar', label: 'Jhajjar Stock' },
  { key: 'stock_bahadurgarh', label: 'Bahadurgarh Stock' },
  { key: 'stock_jkl', label: 'JK Lakshmi Stock' },
  { key: 'cashbook', label: 'Cashbook' },
  { key: 'pay', label: 'Pay & Freight', hint: 'Also vehicle credit/debit and trip profit' },
  { key: 'invoice', label: 'Generate Invoice' },
  { key: 'vehicle', label: 'Fleet', hint: 'Vehicles, tyres, maintenance, market vehicles' },
  { key: 'diesel', label: 'Diesel Control' },
  { key: 'mileage', label: 'Mileage Tracker' },
  { key: 'sell', label: 'Sell' },
  { key: 'attendance', label: 'Attendance' },
  { key: 'loading_status', label: 'Loading Realtime' },

  // Superseded by lr_dump when the three JK Super LR screens merged into one.
  // Still read as a fallback in App.jsx and for edit rights in LRModule.jsx,
  // so they are shown — separately — rather than silently dropped.
  { key: 'lr_kosli', label: 'Kosli LR', legacy: true, supersededBy: 'lr_dump' },
  { key: 'lr_jhajjar', label: 'Jhajjar LR', legacy: true, supersededBy: 'lr_dump' },
  { key: 'lr_bahadurgarh', label: 'Bahadurgarh LR', legacy: true, supersededBy: 'lr_dump' },
];

export const MODULE_BY_KEY = Object.fromEntries(MODULES.map(m => [m.key, m]));
export const CURRENT_MODULES = MODULES.filter(m => !m.legacy);
export const LEGACY_MODULES = MODULES.filter(m => m.legacy);

export const moduleLabel = (key) => MODULE_BY_KEY[key]?.label || key;

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
};
