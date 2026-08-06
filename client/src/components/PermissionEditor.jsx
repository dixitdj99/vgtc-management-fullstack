import React, { useMemo, useState } from 'react';
import { Search, Check, Copy, Layers, ChevronDown, ChevronRight, AlertTriangle, RotateCcw } from 'lucide-react';
import {
  LOCATIONS, LEVELS, MODULE_BY_KEY, MODULES, LEGACY_MODULES,
  moduleLabel, summarise, assertCatalogueMatchesNav,
} from '../permissions/catalogue';

/**
 * PermissionEditor — one editor, used by every screen that grants access.
 *
 * There were three near-identical copies of this UI, already disagreeing about
 * which modules exist. This is the single one; the catalogue it reads from is
 * the single list. See permissions/catalogue.js.
 *
 * Two ideas shape the layout:
 *
 *  - A location is a gate, not a folder. Turning off "Kosli" does not erase the
 *    module levels stored underneath, so the previous UI's habit of hiding them
 *    made it look like access had been revoked when it had only been masked.
 *    Here they stay visible and greyed, and the summary line says so.
 *  - An admin wants to know the outcome, not audit thirty toggles, so every
 *    location states its result in words.
 *
 * @param {object}   permissions   the permissions object being edited
 * @param {Function} onChange      (nextPermissions) => void
 * @param {object[]} [users]       other users, enables "copy from"
 * @param {object}   [roleTemplates] org role presets, keyed by role name
 * @param {string[]} [navPermKeys] nav keys, for the development drift warning
 */
export default function PermissionEditor({ permissions = {}, onChange, users = [], roleTemplates = {}, navPermKeys = [] }) {
  const [query, setQuery] = useState('');
  const [changedOnly, setChangedOnly] = useState(false);
  const [collapsed, setCollapsed] = useState({});
  const [showLegacy, setShowLegacy] = useState(false);
  const [baseline] = useState(() => ({ ...permissions }));

  useMemo(() => assertCatalogueMatchesNav(navPermKeys), [navPermKeys]);

  const perms = permissions || {};
  const allowedPlants = perms.allowedPlants;
  const allowedGodowns = perms.allowedGodowns;

  const patch = (next) => onChange({ ...perms, ...next });
  const setLevel = (key, value) => patch({ [key]: value || undefined });

  /** A location is on unless an explicit allow-list excludes it. */
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
      // Only drop the plant when no sibling location still needs it.
      const siblingsOn = LOCATIONS.some(l => l.id !== loc.id && l.plantKey === loc.plantKey && (!l.godownKey || godowns.has(l.godownKey)));
      if (!siblingsOn) plants.delete(loc.plantKey);
    }
    patch({ allowedPlants: [...plants], allowedGodowns: [...godowns] });
  };

  const setMany = (keys, value) => {
    const next = {};
    keys.forEach(k => { next[k] = value || undefined; });
    patch(next);
  };

  const applyTemplate = (role) => {
    const tpl = roleTemplates?.[role];
    if (!tpl) return;
    const cleared = {};
    MODULES.forEach(m => { cleared[m.key] = undefined; });
    patch({ ...cleared, ...tpl });
  };

  const copyFrom = (userId) => {
    const u = users.find(x => String(x.id) === String(userId));
    if (!u) return;
    const cleared = {};
    MODULES.forEach(m => { cleared[m.key] = undefined; });
    onChange({ ...cleared, ...(u.permissions || {}) });
  };

  const changedKeys = useMemo(
    () => MODULES.map(m => m.key).filter(k => (baseline[k] || '') !== (perms[k] || '')),
    [baseline, perms]
  );

  const matches = (key) => {
    if (changedOnly && !changedKeys.includes(key)) return false;
    if (!query.trim()) return true;
    const q = query.trim().toLowerCase();
    const m = MODULE_BY_KEY[key];
    return key.toLowerCase().includes(q) || (m?.label || '').toLowerCase().includes(q) || (m?.hint || '').toLowerCase().includes(q);
  };

  const totals = summarise(perms);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '180px' }}>
          <Search size={13} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input className="fi" value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Search modules…" style={{ paddingLeft: '30px', fontSize: '12px' }} />
        </div>

        {Object.keys(roleTemplates || {}).length > 0 && (
          <select className="fi" style={{ width: 'auto', fontSize: '12px' }} value=""
            onChange={e => { if (e.target.value) applyTemplate(e.target.value); e.target.value = ''; }}>
            <option value="">Apply role preset…</option>
            {Object.keys(roleTemplates).map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        )}

        {users.length > 0 && (
          <select className="fi" style={{ width: 'auto', fontSize: '12px' }} value=""
            onChange={e => { if (e.target.value) copyFrom(e.target.value); e.target.value = ''; }}>
            <option value="">Copy from user…</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.name || u.username}</option>)}
          </select>
        )}

        <button type="button" onClick={() => setChangedOnly(v => !v)}
          className={`btn btn-sm ${changedOnly ? 'btn-p' : 'btn-g'}`} style={{ fontSize: '11px' }}>
          Changed {changedKeys.length > 0 ? `(${changedKeys.length})` : ''}
        </button>
        <button type="button" onClick={() => setMany(MODULES.map(m => m.key), '')}
          className="btn btn-g btn-sm" style={{ fontSize: '11px' }} title="Clear every module">
          <RotateCcw size={12} /> Clear all
        </button>
      </div>

      {/* Outcome, in words */}
      <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', fontWeight: 700 }}>
        <Layers size={12} style={{ verticalAlign: '-2px', marginRight: '4px' }} />
        {totals.granted === 0
          ? 'No access granted yet — this user will see an empty dashboard.'
          : `${totals.granted} of ${totals.total} modules granted · ${totals.writable} can be edited`}
      </div>

      {LOCATIONS.map(loc => {
        const on = isLocationOn(loc);
        const locKeys = loc.groups.flatMap(g => g.modules);
        const s = summarise(perms, locKeys);
        const isCollapsed = collapsed[loc.id];
        const visibleGroups = loc.groups
          .map(g => ({ ...g, modules: g.modules.filter(matches) }))
          .filter(g => g.modules.length > 0);
        if (visibleGroups.length === 0 && (query || changedOnly)) return null;

        return (
          <div key={loc.id} style={{
            border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden',
            borderLeft: `3px solid ${on ? loc.color : 'var(--border)'}`, opacity: on ? 1 : 0.75,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', background: 'var(--bg-th)' }}>
              <button type="button" onClick={() => setCollapsed(c => ({ ...c, [loc.id]: !c[loc.id] }))}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}>
                {isCollapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
              </button>
              <label style={{ display: 'flex', alignItems: 'center', gap: '7px', cursor: 'pointer', flex: 1 }}>
                <input type="checkbox" checked={on} onChange={e => toggleLocation(loc, e.target.checked)} />
                <span style={{ fontSize: '13px', fontWeight: 800, color: on ? loc.color : 'var(--text-muted)' }}>{loc.label}</span>
              </label>
              <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)' }}>
                {on
                  ? (s.granted ? `${s.granted} modules · ${s.writable} editable` : 'no modules granted')
                  : 'location turned off — modules below are kept but hidden from the user'}
              </span>
              <div style={{ display: 'flex', gap: '4px' }}>
                {['view', 'edit', ''].map(v => (
                  <button key={v || 'none'} type="button" onClick={() => setMany(locKeys, v)}
                    className="btn btn-g btn-sm" style={{ fontSize: '10px', padding: '3px 7px' }}
                    title={`Set every module in ${loc.label} to ${v || 'none'}`}>
                    {v ? `All ${v}` : 'None'}
                  </button>
                ))}
              </div>
            </div>

            {!isCollapsed && (
              <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {visibleGroups.map(g => (
                  <div key={g.id}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <span style={{ fontSize: '9.5px', fontWeight: 800, color: loc.color, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{g.label}</span>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        {['view', 'edit', ''].map(v => (
                          <button key={v || 'none'} type="button" onClick={() => setMany(g.modules, v)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)' }}>
                            {v || 'none'}
                          </button>
                        ))}
                      </div>
                    </div>
                    {g.modules.map(key => (
                      <ModuleRow key={`${g.id}-${key}`} moduleKey={key} value={perms[key] || ''}
                        dimmed={!on} changed={changedKeys.includes(key)} onChange={setLevel} />
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* Legacy keys, out of the way but not hidden */}
      {LEGACY_MODULES.some(m => perms[m.key]) || showLegacy ? (
        <div style={{ border: '1px dashed var(--border)', borderRadius: '12px', padding: '10px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
            <AlertTriangle size={13} color="#f59e0b" />
            <span style={{ fontSize: '11px', fontWeight: 800 }}>Legacy keys</span>
            <span style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>
              kept only for accounts created before the JK Super LR screens merged — grant <strong>{moduleLabel('lr_dump')}</strong> instead
            </span>
          </div>
          {LEGACY_MODULES.map(m => (
            <ModuleRow key={m.key} moduleKey={m.key} value={perms[m.key] || ''} legacy
              changed={changedKeys.includes(m.key)} onChange={setLevel} />
          ))}
        </div>
      ) : (
        <button type="button" onClick={() => setShowLegacy(true)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '11px', color: 'var(--text-muted)', textAlign: 'left' }}>
          Show legacy keys
        </button>
      )}
    </div>
  );
}

function ModuleRow({ moduleKey, value, onChange, dimmed = false, changed = false, legacy = false }) {
  const meta = MODULE_BY_KEY[moduleKey] || {};
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0',
      opacity: dimmed ? 0.5 : 1,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '6px' }}>
          {meta.label || moduleKey}
          {changed && <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--accent)' }} title="Changed" />}
          {legacy && <span style={{ fontSize: '9px', fontWeight: 800, color: '#f59e0b' }}>LEGACY</span>}
        </div>
        {meta.hint && <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{meta.hint}</div>}
      </div>
      <div style={{ display: 'flex', gap: '3px', flexShrink: 0 }}>
        {LEVELS.map(l => {
          const active = (value || '') === l.value;
          return (
            <button key={l.value || 'none'} type="button" title={l.hint}
              onClick={() => onChange(moduleKey, l.value)}
              style={{
                // Spelled out rather than V/E/D — an abbreviation on a control
                // that decides who can delete records is a bad place to save space.
                minWidth: '62px', padding: '4px 9px', borderRadius: '6px', cursor: 'pointer',
                border: `1px solid ${active ? l.color : 'var(--border)'}`,
                background: active ? l.color : 'transparent',
                color: active ? '#fff' : 'var(--text-muted)',
                fontSize: '10.5px', fontWeight: 800, fontFamily: 'inherit',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '3px',
              }}>
              {active && <Check size={10} />} {l.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
