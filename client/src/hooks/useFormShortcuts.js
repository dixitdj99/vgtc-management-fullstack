import { useEffect, useRef } from 'react';

/**
 * Tally-style keyboard navigation for entry forms.
 *
 * Attach the returned ref to the element wrapping the form fields:
 *   const formRef = useFormShortcuts({ onSave, onCancel, enabled: !isConfirming });
 *   <div ref={formRef}> ...fields... </div>
 *
 * Behavior:
 *  - Ctrl+S / Ctrl+Enter → onSave() (works anywhere while enabled)
 *  - Esc → onCancel() (omit onCancel for inline forms that shouldn't close)
 *  - Enter inside the container → advance to next field; on last field → onSave()
 *    (textareas keep Enter for newlines; buttons/links keep native activation)
 *  - Datalist inputs: Enter both commits the highlighted suggestion and advances —
 *    that's the Tally pick-and-move flow, intentional.
 *  - autoFocus: focuses the first empty field on mount (falls back to first field),
 *    so a sticky prefilled date doesn't trap the cursor.
 *
 * Pass enabled: false while a stacked modal (ConfirmSaveModal etc.) is open so
 * only the topmost layer handles keys.
 */
const FOCUSABLE = 'input:not([type="hidden"]):not(:disabled), select:not(:disabled), textarea:not(:disabled)';

const isVisible = (el) => el.offsetParent !== null;

export default function useFormShortcuts({
    onSave,
    onCancel,
    enabled = true,
    autoFocus = true,
    enterAdvances = true,
} = {}) {
    const containerRef = useRef(null);
    const cbRef = useRef({});
    cbRef.current = { onSave, onCancel, enabled, enterAdvances };

    // Autofocus first empty field on mount
    useEffect(() => {
        if (!autoFocus || !containerRef.current) return;
        const fields = Array.from(containerRef.current.querySelectorAll(FOCUSABLE)).filter(isVisible);
        if (fields.length === 0) return;
        const target = fields.find(f => !f.value) || fields[0];
        // Delay so modal mount animations don't steal focus back
        const t = setTimeout(() => target.focus(), 50);
        return () => clearTimeout(t);
    }, [autoFocus]);

    useEffect(() => {
        const handler = (e) => {
            const { onSave, onCancel, enabled, enterAdvances } = cbRef.current;
            if (!enabled || !containerRef.current) return;

            // Ctrl+S / Ctrl+Enter → save (capture phase beats browser save dialog)
            if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S' || e.key === 'Enter')) {
                e.preventDefault();
                e.stopPropagation();
                onSave?.();
                return;
            }

            // Esc → cancel/close
            if (e.key === 'Escape' && onCancel) {
                e.preventDefault();
                e.stopPropagation();
                onCancel();
                return;
            }

            // Enter → advance to next field (only inside our container)
            if (e.key === 'Enter' && enterAdvances && containerRef.current.contains(e.target)) {
                const tag = e.target.tagName;
                if (tag === 'TEXTAREA' || tag === 'BUTTON' || tag === 'A') return;
                if (e.target.type === 'submit') return;

                const fields = Array.from(containerRef.current.querySelectorAll(FOCUSABLE)).filter(isVisible);
                const idx = fields.indexOf(e.target);
                if (idx === -1) return;

                e.preventDefault(); // suppress implicit <form> submit
                if (idx < fields.length - 1) {
                    fields[idx + 1].focus();
                    if (fields[idx + 1].select) fields[idx + 1].select();
                } else {
                    onSave?.(); // last field — ConfirmSaveModal is the guard
                }
            }
        };

        document.addEventListener('keydown', handler, { capture: true });
        return () => document.removeEventListener('keydown', handler, { capture: true });
    }, []);

    return containerRef;
}

/**
 * Highlights empty required fields ([required] or [data-required]) inside the
 * container with .fi-invalid, focuses the first offender, and returns the count.
 * The highlight clears itself on the field's next input event.
 * Call before opening the confirm modal: if (markInvalidFields(ref.current)) return;
 */
export function markInvalidFields(container) {
    if (!container) return 0;
    const required = Array.from(container.querySelectorAll('[required], [data-required]')).filter(isVisible);
    const empty = required.filter(f => !String(f.value ?? '').trim());
    empty.forEach(f => {
        f.classList.add('fi-invalid');
        f.addEventListener('input', () => f.classList.remove('fi-invalid'), { once: true });
    });
    if (empty.length > 0) empty[0].focus();
    return empty.length;
}
