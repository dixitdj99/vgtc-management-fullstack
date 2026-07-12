import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, CornerDownLeft } from 'lucide-react';

/**
 * Ctrl+K command palette.
 *
 * Keyboard handling registers on WINDOW with capture:true — window capture fires
 * before the document-capture listeners in useFormShortcuts, so stopPropagation()
 * here reliably keeps Esc/Enter/Ctrl+S away from any entry form underneath.
 * Only keys the palette owns are stopped; plain typing passes through to the input.
 */

// Subsequence fuzzy match: every query char appears in order.
// Returns rank: 0 = substring (best), 1 = subsequence, -1 = no match.
function matchRank(text, query) {
    const t = text.toLowerCase();
    const q = query.toLowerCase().trim();
    if (!q) return 1;
    if (t.includes(q)) return 0;
    let i = 0;
    for (const ch of t) {
        if (ch === q[i]) i++;
        if (i === q.length) return 1;
    }
    return -1;
}

export default function CommandPalette({ open, onClose, commands }) {
    const [query, setQuery] = useState('');
    const [selected, setSelected] = useState(0);
    const inputRef = useRef(null);
    const listRef = useRef(null);
    const stateRef = useRef({});

    const filtered = useMemo(() => {
        return commands
            .map(c => ({ ...c, _rank: matchRank(`${c.label} ${c.keywords || ''}`, query) }))
            .filter(c => c._rank >= 0)
            .sort((a, b) => a._rank - b._rank);
    }, [commands, query]);

    stateRef.current = { filtered, selected, onClose };

    useEffect(() => { setSelected(0); }, [query, open]);
    useEffect(() => { if (open) { setQuery(''); setTimeout(() => inputRef.current?.focus(), 40); } }, [open]);

    // Keep selection visible
    useEffect(() => {
        listRef.current?.children[selected]?.scrollIntoView({ block: 'nearest' });
    }, [selected]);

    useEffect(() => {
        if (!open) return;
        const handler = (e) => {
            const { filtered, selected, onClose } = stateRef.current;
            const own = () => { e.preventDefault(); e.stopPropagation(); };

            if (e.key === 'Escape') { own(); onClose(); return; }
            if (e.key === 'ArrowDown') { own(); setSelected(s => Math.min(s + 1, filtered.length - 1)); return; }
            if (e.key === 'ArrowUp') { own(); setSelected(s => Math.max(s - 1, 0)); return; }
            if (e.key === 'Enter') {
                own();
                const cmd = filtered[selected];
                if (cmd) { cmd.run(); onClose(); }
                return;
            }
            // Swallow form-save combos so a dirty form underneath can't trigger
            if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S' || e.key === 'Enter')) { own(); }
        };
        window.addEventListener('keydown', handler, { capture: true });
        return () => window.removeEventListener('keydown', handler, { capture: true });
    }, [open]);

    return (
        <AnimatePresence>
            {open && (
                <div
                    style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(3px)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', paddingTop: '14vh' }}
                    onClick={onClose}
                >
                    <motion.div
                        initial={{ opacity: 0, scale: 0.97, y: -8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }}
                        transition={{ duration: 0.12 }}
                        onClick={e => e.stopPropagation()}
                        style={{ width: '94%', maxWidth: '560px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '14px', boxShadow: '0 24px 60px rgba(0,0,0,0.4)', overflow: 'hidden' }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
                            <Search size={16} color="var(--text-muted)" />
                            <input
                                ref={inputRef}
                                value={query}
                                onChange={e => setQuery(e.target.value)}
                                placeholder="Jump to module or action..."
                                style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: '15px', color: 'var(--text)', fontWeight: 600 }}
                            />
                            <kbd style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: '5px', padding: '2px 6px' }}>ESC</kbd>
                        </div>
                        <div ref={listRef} style={{ maxHeight: '46vh', overflowY: 'auto', padding: '6px' }}>
                            {filtered.length === 0 ? (
                                <div style={{ padding: '24px', textAlign: 'center', fontSize: '12.5px', color: 'var(--text-muted)', fontWeight: 600 }}>No matches</div>
                            ) : filtered.map((cmd, i) => (
                                <div key={cmd.id}
                                    onClick={() => { cmd.run(); onClose(); }}
                                    onMouseEnter={() => setSelected(i)}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: '11px', padding: '9px 12px',
                                        borderRadius: '9px', cursor: 'pointer',
                                        background: i === selected ? 'var(--primary-glow)' : 'transparent',
                                    }}
                                >
                                    <div style={{ background: `${cmd.color || '#6366f1'}18`, color: cmd.color || 'var(--primary)', padding: '6px', borderRadius: '8px', display: 'flex' }}>
                                        {cmd.Icon && <cmd.Icon size={14} />}
                                    </div>
                                    <span style={{ flex: 1, fontSize: '13.5px', fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cmd.label}</span>
                                    {cmd.group && (
                                        <span style={{ fontSize: '9.5px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{cmd.group}</span>
                                    )}
                                    {i === selected && <CornerDownLeft size={12} color="var(--text-muted)" />}
                                </div>
                            ))}
                        </div>
                        <div style={{ padding: '8px 16px', borderTop: '1px solid var(--border)', fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', display: 'flex', gap: '14px' }}>
                            <span>↑↓ navigate</span><span>Enter open</span><span>Esc close</span>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
