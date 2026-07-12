import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Lightweight mobile navigation: 5 tab roots, each with its own screen stack
 * for list→detail→form push/pop. A history.pushState/popstate bridge maps the
 * Android/browser back button to pop the top screen (or close a sheet first).
 *
 * Screen object: { key, title, render: (nav) => JSX }
 */
export default function useMobileNav(initialTab = 'dashboard') {
    const [tab, setTabState] = useState(initialTab);
    const [stacks, setStacks] = useState({});
    const [sheet, setSheet] = useState(null); // { title, render } | null
    const internalBack = useRef(false);

    const stack = stacks[tab] || [];
    const top = stack[stack.length - 1] || null;

    const pushHistory = () => {
        try { window.history.pushState({ m: Date.now() }, ''); } catch { /* noop */ }
    };

    const setTab = useCallback((id) => {
        setSheet(null);
        setTabState(id);
    }, []);

    const push = useCallback((screen) => {
        setStacks(s => ({ ...s, [tab]: [...(s[tab] || []), screen] }));
        pushHistory();
    }, [tab]);

    const pop = useCallback(() => {
        setStacks(s => {
            const cur = s[tab] || [];
            if (cur.length === 0) return s;
            return { ...s, [tab]: cur.slice(0, -1) };
        });
    }, [tab]);

    const openSheet = useCallback((s) => {
        setSheet(s);
        pushHistory();
    }, []);

    const closeSheet = useCallback(() => setSheet(null), []);

    // Hardware / browser back: close sheet first, else pop screen, else let it exit
    useEffect(() => {
        const onPop = () => {
            if (internalBack.current) { internalBack.current = false; return; }
            if (sheet) { setSheet(null); return; }
            const cur = stacks[tab] || [];
            if (cur.length > 0) { setStacks(s => ({ ...s, [tab]: (s[tab] || []).slice(0, -1) })); return; }
            // at a tab root — allow default (may exit app)
        };
        window.addEventListener('popstate', onPop);
        return () => window.removeEventListener('popstate', onPop);
    }, [tab, stacks, sheet]);

    return { tab, setTab, stack, top, push, pop, sheet, openSheet, closeSheet };
}
