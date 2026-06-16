import { useState, useEffect } from 'react';

/**
 * Viewport mode for the desktop/mobile split.
 *   width > 1024        → desktop (existing UI, untouched)
 *   769–1024 (tablet)   → mobile screens, 2-column card grids
 *   ≤768 (phone)        → mobile screens, single column
 *
 * Branch on `mode` only — crossing the 768↔769 line changes `cols` but not
 * `mode`, so no component remount there. The single remount boundary is 1024.
 * Pure CSR (no SSR) so reading window on first render is safe.
 */
function read() {
    const w = window.innerWidth;
    if (w > 1024) return { mode: 'desktop', cols: 1 };
    return { mode: 'mobile', cols: w >= 769 ? 2 : 1 };
}

export default function useViewport() {
    const [vp, setVp] = useState(read);

    useEffect(() => {
        let t;
        const onResize = () => {
            clearTimeout(t);
            t = setTimeout(() => {
                setVp(prev => {
                    const next = read();
                    return (prev.mode === next.mode && prev.cols === next.cols) ? prev : next;
                });
            }, 150);
        };
        window.addEventListener('resize', onResize);
        window.addEventListener('orientationchange', onResize);
        return () => {
            clearTimeout(t);
            window.removeEventListener('resize', onResize);
            window.removeEventListener('orientationchange', onResize);
        };
    }, []);

    return vp;
}
