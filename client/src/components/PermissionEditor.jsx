import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Search, Check, Layers, ChevronDown, ChevronRight, TriangleAlert, RotateCcw,
  FileText, Truck, Banknote, BarChart3, Users, Gauge, Boxes, Radio, Shield, Receipt,
  FileSpreadsheet, Fuel, ShoppingCart, Wallet, MapPin, Globe, SearchX,
} from 'lucide-react';
import {
  LOCATIONS, LOCATION_SECTIONS, SHARED_GROUPS, SHARED_KEYS, LEVELS,
  MODULE_BY_KEY, MODULES, LEGACY_MODULES, CURRENT_MODULES,
  moduleLabel, summarise, locationOwnKeys, locationsForKey, assertCatalogueMatchesNav,
} from '../permissions/catalogue';

/** Levels that appear as chips once a module is switched on. */
const GRANT_LEVELS = LEVELS.filter(l => l.value);
const DEFAULT_LEVEL = 'view';

const ICONS = [
  [/^lr_/, FileText],
  [/^bill_/, Receipt],
  [/^voucher_/, FileText],
  [/^balance_/, BarChart3],
  [/^stock_/, Boxes],
  [/^cashbook$/, Wallet],
  [/^pay$/, Banknote],
  [/^invoice$/, FileSpreadsheet],
  [/^vehicle$/, Truck],
  [/^diesel$/, Fuel],
  [/^mileage$/, Gauge],
  [/^sell$/, ShoppingCart],
  [/^attendance$/, Users],
  [/^loading_status$/, Radio],
];

const iconFor = (key) => (ICONS.find(([re]) => re.test(key)) || [null, Shield])[1];

/**
 * PermissionEditor — grants module access for one account.
 *
 * Two things it deliberately does differently from the screen it replaced:
 *
 *  1. Each key renders once. Permission keys are global — `pay` is a single
 *     value on the user record — but the old editor walked the location groups
 *     verbatim, so eight company-wide keys appeared under all four locations at
 *     once, every copy bound to the same value. Toggling one appeared to toggle
 *     three others, and a location's "All view" quietly rewrote what the rest
 *     showed. The catalogue now separates owned keys from shared ones.
 *
 *  2. The baseline resets. The change markers compared against whatever
 *     permissions were passed on first mount, so after switching to a second
 *     user they were still diffing against the first one's grants. The baseline
 *     re-bases whenever `resetKey` changes, and `showChanges` keeps the markers
 *     off entirely while creating an account, where every grant is new by
 *     definition and a dot on each one says nothing.
 */
export default function PermissionEditor({
  permissions = {},
  onChange,
  users = [],
  roleTemplates = {},
  navPermKeys = [],
  resetKey = '',
  disabled = false,
  showChanges = false,
}) {
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState({});
  const [baseline, setBaseline] = useState(() => ({ ...permissions }));

  const perms = permissions || {};
  const seenReset = useRef(resetKey);

  useEffect(() => {
    if (seenReset.current === resetKey) return;
    seenReset.current = resetKey;
    setBaseline({ ...perms });
    setQuery('');
    setCollapsed({});
  }, [resetKey, perms]);

  useMemo(() => assertCatalogueMatchesNav(navPermKeys), [navPermKeys]);

  const allowedPlants = perms.allowedPlants;
  const allowedGodowns = perms.allowedGodowns;

  const patch = (next) => { if (!disabled) onChange({ ...perms, ...next }); };
  const setLevel = (key, value) => patch({ [key]: value || undefined });

  const setMany = (keys, value) => {
    const next = {};
    keys.forEach(k => { next[k] = value || undefined; });
    patch(next);
  };

  // ── Locations ────────────────────────────────────────────────
  // An absent allowedPlants / allowedGodowns means "everywhere", which is why
  // the toggle seeds its working set from every location before removing one.

  const isLocationOn = (loc) => {
    if (Array.isArray(allowedPlants) && !allowedPlants.includes(loc.plantKey)) return false;
    if (loc.godownKey && Array.isArray(allowedGodowns) && !allowedGodowns.includes(loc.godownKey)) return false;
    return true;
  };

  const toggleLocation = (loc, on) => {
    const plants = new Set(Array.isArray(allowedPlants) ? allowedPlants : LOCATIONS.map(l => l.plantKey));
    const godowns = new Set(Array.isArray(allowedGodowns) ? allowedGodowns : LOCATIONS.filter(l => l.godownKey).map(l => l.godownKey));
    if (on) {
      plants.add(loc.plantKey);
      if (loc.godownKey) godowns.add(loc.godownKey);
    } else {
      if (loc.godownKey) godowns.delete(loc.godownKey);
      const siblingsOn = LOCATIONS.some(l => l.id !== loc.id && l.plantKey === loc.plantKey && (!l.godownKey || godowns.has(l.godownKey)));
      if (!siblingsOn) plants.delete(loc.plantKey);
    }
    patch({ allowedPlants: [...plants], allowedGodowns: [...godowns] });
  };

  const setAllLocations = (on) => {
    if (on) patch({ allowedPlants: LOCATIONS.map(l => l.plantKey), allowedGodowns: LOCATIONS.filter(l => l.godownKey).map(l => l.godownKey) });
    else patch({ allowedPlants: [], allowedGodowns: [] });
  };

  const locationsOn = LOCATIONS.filter(isLocationOn);

  // ── Presets ──────────────────────────────────────────────────

  const applyTemplate = (role) => {
    const tpl = roleTemplates?.[role];
    if (!tpl) return;
    const cleared = {};
    MODULES.forEach(m => { cleared[m.key] = undefined; });
    patch({ ...cleared, ...tpl });
  };

  const copyFrom = (userId) => {
    const u = users.find(x => String(x.id) === String(userId));
    if (!u || disabled) return;
    const cleared = {};
    MODULES.forEach(m => { cleared[m.key] = undefined; });
    onChange({ ...cleared, ...(u.permissions || {}) });
  };

  // ── Diff & filtering ─────────────────────────────────────────

  // Only meaningful when editing an existing account. On create, every grant is
  // a change from nothing, so a dot on every row you touch says nothing.
  const changedKeys = useMemo(() => (
    showChanges ? MODULES.map(m => m.key).filter(k => (baseline[k] || '') !== (perms[k] || '')) : []
  ), [showChanges, baseline, perms]);

  const locationsChanged = useMemo(() => {
    if (!showChanges) return false;
    const norm = (v) => (Array.isArray(v) ? [...v].sort().join(',') : '*');
    return norm(baseline.allowedPlants) !== norm(perms.allowedPlants)
      || norm(baseline.allowedGodowns) !== norm(perms.allowedGodowns);
  }, [showChanges, baseline, perms]);

  const matches = (key) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    const m = MODULE_BY_KEY[key] || {};
    return key.toLowerCase().includes(q)
      || (m.label || '').toLowerCase().includes(q)
      || (m.hint || '').toLowerCase().includes(q);
  };

  const filterGroups = (groups) => groups
    .map(g => ({ ...g, modules: g.modules.filter(matches) }))
    .filter(g => g.modules.length > 0);

  const sharedGroups = filterGroups(SHARED_GROUPS);
  const locationSections = LOCATION_SECTIONS
    .map(loc => ({ ...loc, visibleGroups: filterGroups(loc.groups) }))
    .filter(loc => loc.visibleGroups.length > 0);

  const totals = summarise(perms);
  const searching = !!query.trim();
  const nothingMatches = searching && sharedGroups.length === 0 && locationSections.length === 0;

  const rowProps = (key) => ({
    moduleKey: key,
    value: perms[key] || '',
    changed: changedKeys.includes(key),
    disabled,
    onChange: setLevel,
  });

  const renderSection = ({ id, title, subtitle, color, groups, headerRight, dim }) => {
    const isCollapsed = collapsed[id];
    const keys = groups.flatMap(g => g.modules);
    return (
      <section key={id} className="adm-loc" style={{ borderLeftColor: color, opacity: dim ? 0.72 : 1 }}>
        <header className="adm-loc-hd">
          <button
            type="button"
            className="adm-btn adm-btn--ghost adm-btn--icon adm-btn--sm"
            onClick={() => setCollapsed(c => ({ ...c, [id]: !c[id] }))}
            aria-expanded={!isCollapsed}
            aria-label={isCollapsed ? `Expand ${title}` : `Collapse ${title}`}
          >
            {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
          </button>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="adm-loc-name" style={{ color }}>{title}</div>
            {subtitle && <div className="adm-sub">{subtitle}</div>}
          </div>

          {headerRight}

          <div className="adm-bulk">
            <button type="button" className="adm-link" disabled={disabled} onClick={() => setMany(keys, 'view')}>All view</button>
            <button type="button" className="adm-link" disabled={disabled} onClick={() => setMany(keys, 'edit')}>All edit</button>
            <button type="button" className="adm-link" disabled={disabled} onClick={() => setMany(keys, '')}>Clear</button>
          </div>
        </header>

        {!isCollapsed && (
          <div className="adm-loc-bd">
            {groups.map(g => (
              <div key={g.id}>
                <div className="adm-group-hd">
                  <span className="adm-group-name">{g.label}</span>
                  {/* A single-group section is already covered by the bulk
                      actions in its own header — the same three links twice,
                      eight pixels apart, is just noise. */}
                  {groups.length > 1 && (
                    <div className="adm-bulk">
                      <button type="button" className="adm-link" disabled={disabled} onClick={() => setMany(g.modules, 'view')}>view</button>
                      <button type="button" className="adm-link" disabled={disabled} onClick={() => setMany(g.modules, 'edit')}>edit</button>
                      <button type="button" className="adm-link" disabled={disabled} onClick={() => setMany(g.modules, '')}>none</button>
                    </div>
                  )}
                </div>
                <div className="adm-perm-list">
                  {g.modules.map(key => <ModuleRow key={key} {...rowProps(key)} />)}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    );
  };

  return (
    <div className="adm-sec">

      <div className="adm-sec-hd">
        <h3>Module access</h3>
        <span className="adm-sec-note">View reads · Edit changes · Delete removes</span>
      </div>

      {/* ── Toolbar ── */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div className="adm-search">
          <Search size={14} />
          <input
            className="adm-input"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search modules…"
            aria-label="Search modules"
          />
        </div>

        {Object.keys(roleTemplates || {}).length > 0 && (
          <select
            className="adm-select"
            style={{ width: 'auto' }}
            value=""
            disabled={disabled}
            aria-label="Apply a role preset"
            onChange={e => { if (e.target.value) applyTemplate(e.target.value); e.target.value = ''; }}
          >
            <option value="">Apply role preset…</option>
            {Object.keys(roleTemplates).map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        )}

        {users.length > 0 && (
          <select
            className="adm-select"
            style={{ width: 'auto' }}
            value=""
            disabled={disabled}
            aria-label="Copy permissions from another user"
            onChange={e => { if (e.target.value) copyFrom(e.target.value); e.target.value = ''; }}
          >
            <option value="">Copy from user…</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.name || u.username}</option>)}
          </select>
        )}

        <button
          type="button"
          onClick={() => setMany(CURRENT_MODULES.map(m => m.key), '')}
          className="adm-btn adm-btn--sm"
          disabled={disabled || totals.granted === 0}
          title="Revoke every module"
        >
          <RotateCcw size={13} /> Clear all
        </button>
      </div>

      {/* ── Outcome ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)' }}>
        <Layers size={13} />
        {totals.granted === 0
          ? <span>No access granted yet — this account will open to an empty dashboard.</span>
          : (
            <>
              <span>{totals.granted} of {totals.total} modules granted</span>
              <span className="adm-chip adm-chip--info">{totals.writable} can write</span>
              <span className="adm-chip adm-chip--muted">{locationsOn.length} of {LOCATIONS.length} locations</span>
            </>
          )}
      </div>

      {/* ── Location access ──
          A row of chips, not a card. It is one question with four answers. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 800, color: 'var(--text-muted)' }}>
            <MapPin size={13} /> Locations this account may open
            {locationsChanged && <span className="adm-dot" title="Changed" />}
          </span>
          <div className="adm-bulk">
            <button type="button" className="adm-link" disabled={disabled} onClick={() => setAllLocations(true)}>Select all</button>
            <button type="button" className="adm-link" disabled={disabled} onClick={() => setAllLocations(false)}>Clear</button>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {LOCATIONS.map(loc => {
              const on = isLocationOn(loc);
              return (
                <button
                  key={loc.id}
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  disabled={disabled}
                  onClick={() => toggleLocation(loc, !on)}
                  className="adm-btn adm-btn--sm"
                  style={{
                    borderColor: on ? loc.color : 'var(--border)',
                    background: on ? `${loc.color}1f` : 'transparent',
                    color: on ? loc.color : 'var(--text-muted)',
                  }}
                >
                  <span
                    className="adm-check"
                    aria-hidden="true"
                    data-mixed={on ? 'true' : 'false'}
                    style={{ width: 15, height: 15, borderRadius: 4, background: on ? loc.color : 'transparent', borderColor: on ? loc.color : 'var(--border)', color: on ? '#fff' : 'transparent' }}
                  >
                    <Check size={11} strokeWidth={3.5} />
                  </span>
                  {loc.label}
                </button>
              );
            })}
          </div>

          {locationsOn.length === 0 && (
            <div className="adm-note adm-note--warn">
              <TriangleAlert size={15} />
              <span>No location selected. Module grants below stay saved, but every screen will be hidden until a location is turned back on.</span>
            </div>
          )}
        </div>
      </div>

      {nothingMatches && (
        <div className="adm-panel">
          <div className="adm-empty">
            <span className="adm-empty-icon"><SearchX size={22} /></span>
            <h3>No modules match</h3>
            <p>Nothing matches “{query.trim()}”.</p>
            <button type="button" className="adm-btn adm-btn--sm" onClick={() => setQuery('')}>Clear search</button>
          </div>
        </div>
      )}

      {/* ── Company-wide modules ── */}
      {sharedGroups.length > 0 && renderSection({
        id: 'shared',
        title: 'Applies everywhere',
        subtitle: `${SHARED_KEYS.length} modules that are not tied to a plant — one grant covers every location.`,
        color: 'var(--primary)',
        groups: sharedGroups,
        headerRight: <span className="adm-chip adm-chip--info"><Globe size={11} /> Company-wide</span>,
      })}

      {/* ── Per-location modules ── */}
      {locationSections.map(loc => {
        const on = isLocationOn(loc);
        const s = summarise(perms, locationOwnKeys(loc));
        return renderSection({
          id: loc.id,
          title: loc.label,
          subtitle: on
            ? (s.granted ? `${s.granted} of ${s.total} granted · ${s.writable} can write` : 'No modules granted here yet')
            : 'Location turned off — these grants are saved but hidden',
          color: on ? loc.color : 'var(--text-muted)',
          groups: loc.visibleGroups,
          dim: !on,
          headerRight: on ? null : <span className="adm-chip adm-chip--warn">Location off</span>,
        });
      })}

      {/* ── Legacy keys ──
          Shown only for the accounts that still hold one. There is nothing to
          grant here on purpose, so a "show legacy keys" link on every new user
          was an invitation to set a key the app has superseded. */}
      {LEGACY_MODULES.some(m => perms[m.key]) && (
        <section className="adm-loc" style={{ borderLeftColor: '#f59e0b' }}>
          <header className="adm-loc-hd">
            <span className="adm-icon-tile" style={{ background: 'rgba(245,158,11,0.14)', color: '#f59e0b', width: 30, height: 30 }}>
              <TriangleAlert size={15} />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="adm-loc-name" style={{ color: '#f59e0b' }}>Legacy keys</div>
              <div className="adm-sub">
                Kept for older accounts. Grant <strong>{moduleLabel('lr_dump')}</strong> under “Applies everywhere” instead.
              </div>
            </div>
            <button type="button" className="adm-link" disabled={disabled} onClick={() => setMany(LEGACY_MODULES.map(m => m.key), '')}>Clear</button>
          </header>
          <div className="adm-perm-list">
            {LEGACY_MODULES.filter(m => perms[m.key]).map(m => <ModuleRow key={m.key} legacy {...rowProps(m.key)} />)}
          </div>
        </section>
      )}
    </div>
  );
}

/**
 * One module. The switch answers "can they reach it at all", the chips answer
 * "and what may they do" — so the common case is one click and the four-way
 * decision only appears once it is relevant.
 */
function ModuleRow({ moduleKey, value, onChange, changed = false, legacy = false, disabled = false }) {
  const meta = MODULE_BY_KEY[moduleKey] || {};
  const Icon = iconFor(moduleKey);
  const on = !!value;
  const shared = SHARED_KEYS.includes(moduleKey);

  return (
    <div className="adm-perm" data-off={on ? 'false' : 'true'}>
      <span className="adm-perm-icon" style={on ? undefined : { background: 'var(--bg-inset)', color: 'var(--text-muted)' }}>
        <Icon size={17} />
      </span>

      <div className="adm-perm-text">
        <div className="adm-perm-name">
          {meta.label || moduleKey}
          {changed && <span className="adm-dot" title="Changed since this panel opened" />}
          {legacy && <span className="adm-chip adm-chip--warn">Legacy</span>}
        </div>
        {meta.hint && <div className="adm-perm-hint">{meta.hint}</div>}
        {shared && (
          <div className="adm-perm-hint" style={{ opacity: 0.8 }}>
            Applies at {locationsForKey(moduleKey).length} locations.
          </div>
        )}
      </div>

      <div className="adm-perm-ctl">
        {on && (
          <div className="adm-levels" role="group" aria-label={`${meta.label || moduleKey} access level`}>
            {GRANT_LEVELS.map(l => (
              <button
                key={l.value}
                type="button"
                data-level={l.value}
                aria-pressed={value === l.value}
                disabled={disabled}
                title={l.hint}
                onClick={() => onChange(moduleKey, l.value)}
                className="adm-level"
              >
                {l.label}
              </button>
            ))}
          </div>
        )}

        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label={`${meta.label || moduleKey} access`}
          disabled={disabled}
          onClick={() => onChange(moduleKey, on ? '' : DEFAULT_LEVEL)}
          className="adm-switch"
        />
      </div>
    </div>
  );
}
