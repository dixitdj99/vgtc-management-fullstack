import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Filter, Search, X, Check, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * ColumnFilter Component
 * @param {string} label - The column display name
 * @param {string} colKey - The key in the data object
 * @param {Array} data - The full dataset to extract unique values from
 * @param {Object} activeFilters - The current global filter state { [colKey]: [] }
 * @param {Function} onFilterChange - Callback when filter is applied for this column
 */
export default function ColumnFilter({ label, colKey, data, activeFilters, onFilterChange }) {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const menuRef = useRef(null);

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (menuRef.current && !menuRef.current.contains(e.target)) {
                setIsOpen(false);
            }
        };
        if (isOpen) document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen]);

    // Extract unique values from data for this column
    const options = useMemo(() => {
        const unique = new Set();
        data.forEach(item => {
            const val = item[colKey];
            if (val !== undefined && val !== null && val !== '') {
                unique.add(String(val));
            }
        });
        return Array.from(unique).sort();
    }, [data, colKey]);

    const currentSelection = activeFilters[colKey] || [];

    const handleToggleValue = (val) => {
        let next;
        if (currentSelection.includes(val)) {
            next = currentSelection.filter(v => v !== val);
        } else {
            next = [...currentSelection, val];
        }
        onFilterChange(colKey, next);
    };

    const handleSelectAll = (select) => {
        onFilterChange(colKey, select ? options : []);
    };

    const isActive = currentSelection.length > 0;

    const filteredOptions = options.filter(opt => 
        opt.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="column-filter-wrap" style={{ display: 'inline-flex', alignItems: 'center', position: 'relative' }}>
            <span style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }} onClick={() => setIsOpen(!isOpen)}>
                {label}
                <Filter 
                    size={11} 
                    style={{ 
                        marginLeft: '3px', 
                        opacity: isActive ? 1 : 0.4, 
                        color: isActive ? 'var(--primary)' : 'inherit' 
                    }} 
                />
            </span>

            <AnimatePresence>
                {isOpen && (
                    <motion.div 
                        ref={menuRef}
                        initial={{ opacity: 0, y: 5, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 5, scale: 0.98 }}
                        className="filter-popover"
                        style={{
                            position: 'absolute',
                            top: '100%',
                            left: 0,
                            zIndex: 100,
                            marginTop: '8px',
                            minWidth: '200px',
                            background: 'var(--bg-card)',
                            border: '1px solid var(--border)',
                            borderRadius: '12px',
                            boxShadow: 'var(--shadow)',
                            padding: '8px',
                        }}
                    >
                        {/* Search */}
                        <div style={{ position: 'relative', marginBottom: '8px' }}>
                            <Search size={11} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} />
                            <input 
                                className="fi fi-sm" 
                                style={{ paddingLeft: '26px', height: '28px', fontSize: '11px', textTransform: 'none' }}
                                placeholder="Search..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                autoFocus
                            />
                        </div>

                        {/* Actions */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 4px 8px', borderBottom: '1px solid var(--border)', marginBottom: '8px' }}>
                            <button className="filter-action-btn" onClick={() => handleSelectAll(true)}>Select All</button>
                            <button className="filter-action-btn" onClick={() => handleSelectAll(false)}>Clear All</button>
                        </div>

                        {/* List */}
                        <div style={{ maxHeight: '200px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1px' }}>
                            {filteredOptions.length === 0 ? (
                                <div style={{ padding: '12px', textAlign: 'center', fontSize: '11px', color: 'var(--text-muted)' }}>No matches</div>
                            ) : (
                                filteredOptions.map(opt => {
                                    const checked = currentSelection.includes(opt);
                                    return (
                                        <div 
                                            key={opt} 
                                            className={`filter-item ${checked ? 'active' : ''}`}
                                            onClick={() => handleToggleValue(opt)}
                                        >
                                            <div className={`filter-checkbox ${checked ? 'checked' : ''}`}>
                                                {checked && <Check size={10} />}
                                            </div>
                                            <span style={{ fontSize: '12px', color: checked ? 'var(--text)' : 'var(--text-sub)' }}>{opt}</span>
                                        </div>
                                    );
                                })
                            )}
                        </div>

                        {/* Footer */}
                        <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end' }}>
                            <button className="btn btn-p btn-sm" style={{ padding: '4px 12px', height: '26px', fontSize: '10px' }} onClick={() => setIsOpen(false)}>Done</button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
