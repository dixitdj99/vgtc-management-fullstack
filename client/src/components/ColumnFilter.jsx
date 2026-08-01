import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Filter, Search, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * ColumnFilter — the excel-style header filter used by every table in the app.
 *
 * Two things it has to work around, both of which made it look broken:
 *
 *  1. **The popover was clipped.** It was absolutely positioned inside a `<th>`,
 *     and every table sits in `.tbl-wrap { overflow-x: auto }`. An overflow
 *     ancestor clips absolutely-positioned descendants, so the panel appeared
 *     cut off — worst on the right-hand columns, where most of it vanished. It
 *     now renders through a portal with fixed positioning, which no ancestor can
 *     clip, and opens downward unless there is no room below.
 *
 *  2. **The option list collapsed once you picked a value.** Callers pass the
 *     rows they are already displaying, which are filtered. Tick "HR47G9999" and
 *     `data` shrinks to that truck, so the list shrank to a single option and
 *     there was no way to add a second or switch without clearing first. The
 *     full set is now remembered while this column's filter is narrowing the
 *     data — see `options` below.
 *
 * @param {string} label column display name
 * @param {string} colKey key in the data object
 * @param {Array} data rows currently displayed — may already be filtered
 * @param {Array} [allData] the unfiltered rows, when the caller has them
 * @param {Object} activeFilters { [colKey]: string[] }
 * @param {Function} onFilterChange (colKey, values) => void
 */
/**
 * Which values the dropdown should offer.
 *
 * The callers pass the rows they are already showing, which are filtered. Once
 * this column has a value ticked, those rows contain only that value — so
 * recomputing from them collapses the list to one entry and the user is stuck
 * with their first choice. The fix is to keep what was known before, and let
 * genuinely new values in.
 *
 * @param {{key: string|null, opts: string[]}} store what is remembered
 * @param {{colKey: string, fromData: string[], trustData: boolean}} input
 *   trustData — the rows are not being narrowed by this column, so believe them
 * @returns {{key: string, opts: string[]}}
 */
export function nextOptions(store, { colKey, fromData, trustData }) {
    // A different column: nothing remembered applies.
    if (store.key !== colKey) return { key: colKey, opts: fromData };
    if (trustData) return { key: colKey, opts: fromData };
    return { key: colKey, opts: [...new Set([...store.opts, ...fromData])].sort() };
}

export default function ColumnFilter({ label, colKey, data, allData, activeFilters, onFilterChange }) {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [pos, setPos] = useState(null);
    const menuRef = useRef(null);
    const triggerRef = useRef(null);

    const currentSelection = activeFilters[colKey] || [];
    const isActive = currentSelection.length > 0;

    /* ── Options ──────────────────────────────────────────────────────────── */

    const uniqueFrom = (rows) => {
        const set = new Set();
        (rows || []).forEach(item => {
            const val = item[colKey];
            if (val !== undefined && val !== null && val !== '') set.add(String(val));
        });
        return [...set].sort();
    };

    // Remembers the widest set seen for this column. While this column's own
    // filter is active the incoming rows only contain the values already ticked,
    // so recomputing from them would leave the user unable to change their mind.
    const remembered = useRef({ key: null, opts: [] });
    const options = useMemo(() => {
        remembered.current = nextOptions(remembered.current, {
            colKey,
            fromData: uniqueFrom(allData || data),
            trustData: Boolean(allData) || !isActive,
        });
        return remembered.current.opts;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data, allData, colKey, isActive]);

    const filteredOptions = options.filter(o => o.toLowerCase().includes(search.toLowerCase()));

    /* ── Placement ────────────────────────────────────────────────────────── */

    const place = useCallback(() => {
        const t = triggerRef.current;
        if (!t) return;
        const r = t.getBoundingClientRect();
        const width = 232;
        const height = menuRef.current?.offsetHeight || 330;
        const gap = 6;

        // Downward by default. Flip up only when there is genuinely no room, and
        // only if flipping actually helps.
        const roomBelow = window.innerHeight - r.bottom;
        const openUp = roomBelow < height + gap && r.top > roomBelow;

        setPos({
            top: openUp ? Math.max(8, r.top - height - gap) : r.bottom + gap,
            left: Math.min(Math.max(8, r.left), window.innerWidth - width - 8),
            width,
            maxHeight: openUp ? r.top - gap - 8 : Math.max(180, roomBelow - gap - 8),
        });
    }, []);

    useEffect(() => {
        if (!isOpen) { setPos(null); return; }
        place();
        // Capture phase so scrolling the table itself — not just the window —
        // keeps the panel attached to its header.
        const onMove = () => place();
        window.addEventListener('scroll', onMove, true);
        window.addEventListener('resize', onMove);
        return () => {
            window.removeEventListener('scroll', onMove, true);
            window.removeEventListener('resize', onMove);
        };
    }, [isOpen, place]);

    // Re-place once the panel has a real height to measure.
    useEffect(() => { if (isOpen && menuRef.current) place(); }, [isOpen, filteredOptions.length, place]);

    useEffect(() => {
        if (!isOpen) return;
        const onDown = (e) => {
            // The trigger toggles on click; without this the mousedown closes it
            // and the click immediately reopens it.
            if (triggerRef.current?.contains(e.target)) return;
            if (menuRef.current?.contains(e.target)) return;
            setIsOpen(false);
        };
        const onKey = (e) => { if (e.key === 'Escape') setIsOpen(false); };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('keydown', onKey);
        };
    }, [isOpen]);

    /* ── Actions ──────────────────────────────────────────────────────────── */

    const toggleValue = (val) => {
        onFilterChange(colKey, currentSelection.includes(val)
            ? currentSelection.filter(v => v !== val)
            : [...currentSelection, val]);
    };
    const selectAll = (select) => onFilterChange(colKey, select ? options : []);

    const panel = pos && (
        <motion.div
            ref={menuRef}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            className="filter-popover"
            style={{
                position: 'fixed',
                top: pos.top,
                left: pos.left,
                width: pos.width,
                zIndex: 4000,
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: '12px',
                boxShadow: '0 18px 44px rgba(0,0,0,0.4)',
                padding: '8px',
                display: 'flex',
                flexDirection: 'column',
                maxHeight: pos.maxHeight,
                // Normal case: header cells are uppercase, and the values inside
                // are data, not headings.
                textTransform: 'none',
                letterSpacing: 0,
            }}
        >
            <div style={{ position: 'relative', marginBottom: '8px', flexShrink: 0 }}>
                <Search size={11} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} />
                <input
                    className="fi fi-sm"
                    style={{ paddingLeft: '26px', height: '28px', fontSize: '11px', textTransform: 'none', width: '100%' }}
                    placeholder="Search…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    autoFocus
                />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 4px 8px', borderBottom: '1px solid var(--border)', marginBottom: '8px', flexShrink: 0 }}>
                <button className="filter-action-btn" onClick={() => selectAll(true)}>Select All</button>
                <span style={{ fontSize: '10px', fontWeight: 700, color: isActive ? 'var(--primary)' : 'var(--text-muted)' }}>
                    {isActive ? `${currentSelection.length} of ${options.length}` : `${options.length}`}
                </span>
                <button className="filter-action-btn" onClick={() => selectAll(false)}>Clear All</button>
            </div>

            <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1px', flex: 1, minHeight: 0 }}>
                {filteredOptions.length === 0 ? (
                    <div style={{ padding: '12px', textAlign: 'center', fontSize: '11px', color: 'var(--text-muted)' }}>No matches</div>
                ) : filteredOptions.map(opt => {
                    const checked = currentSelection.includes(opt);
                    return (
                        // flexShrink: 0 — the list is a flex column, and without
                        // it the rows squash instead of scrolling.
                        <div key={opt} className={`filter-item ${checked ? 'active' : ''}`} style={{ flexShrink: 0 }} onClick={() => toggleValue(opt)}>
                            <div className={`filter-checkbox ${checked ? 'checked' : ''}`}>{checked && <Check size={10} />}</div>
                            <span style={{ fontSize: '12px', color: checked ? 'var(--text)' : 'var(--text-sub)' }}>{opt}</span>
                        </div>
                    );
                })}
            </div>

            <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', flexShrink: 0 }}>
                <button className="btn btn-p btn-sm" style={{ padding: '4px 12px', height: '26px', fontSize: '10px' }} onClick={() => setIsOpen(false)}>Done</button>
            </div>
        </motion.div>
    );

    return (
        <div className="column-filter-wrap" style={{ display: 'inline-flex', alignItems: 'center', position: 'relative' }}>
            <span ref={triggerRef} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                onClick={() => setIsOpen(o => !o)}>
                {label}
                <Filter size={11} style={{ marginLeft: '3px', opacity: isActive ? 1 : 0.4, color: isActive ? 'var(--primary)' : 'inherit' }} />
                {isActive && (
                    <span style={{ fontSize: '9px', fontWeight: 800, color: 'var(--primary)', background: 'rgba(99,102,241,0.12)', borderRadius: '4px', padding: '0 4px', lineHeight: '14px' }}>
                        {currentSelection.length}
                    </span>
                )}
            </span>

            {/* Portalled to body: no overflow ancestor can clip it. */}
            {createPortal(<AnimatePresence>{isOpen && panel}</AnimatePresence>, document.body)}
        </div>
    );
}
