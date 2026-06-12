import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Check, X, Loader2 } from 'lucide-react';

export default function ConfirmSaveModal({ isOpen, onClose, onConfirm, title, message, isSaving, confirmText }) {
    const confirmBtnRef = useRef(null);
    const stateRef = useRef({});
    stateRef.current = { isOpen, isSaving, onConfirm, onClose };

    // Keyboard: Enter / Ctrl+S confirms, Esc cancels. Capture phase + stopPropagation
    // so the underlying form's shortcuts never see these keys while we're open.
    useEffect(() => {
        if (!isOpen) return;
        const t = setTimeout(() => confirmBtnRef.current?.focus(), 60);
        const handler = (e) => {
            const { isSaving, onConfirm, onClose } = stateRef.current;
            if (isSaving) { e.preventDefault(); e.stopPropagation(); return; }
            if (e.key === 'Enter' || ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S'))) {
                e.preventDefault();
                e.stopPropagation();
                onConfirm?.();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                onClose?.();
            }
        };
        document.addEventListener('keydown', handler, { capture: true });
        return () => {
            clearTimeout(t);
            document.removeEventListener('keydown', handler, { capture: true });
        };
    }, [isOpen]);

    return (
        <AnimatePresence>
            {isOpen && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)' }}>
                    <motion.div initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                        style={{ width: '90%', maxWidth: '360px', background: 'var(--bg-card)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: '16px', boxShadow: '0 24px 60px rgba(0,0,0,0.5)', padding: '28px 24px', textAlign: 'center' }}>
                        <div style={{ width: '52px', height: '52px', borderRadius: '14px', background: 'rgba(16,185,129,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                            <AlertTriangle size={26} color="#10b981" />
                        </div>
                        <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text)', marginBottom: '8px' }}>
                            {title || 'Confirm Save'}
                        </div>
                        <div style={{ fontSize: '12.5px', color: 'var(--text-sub)', marginBottom: '22px' }}>
                            {message || 'Are you sure you want to save this entry?'}
                        </div>
                        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                            <button type="button" className="btn btn-g" onClick={onClose} disabled={isSaving}>Cancel</button>
                            <button type="button" ref={confirmBtnRef} className="btn btn-p" onClick={onConfirm} disabled={isSaving}>
                                {isSaving ? <Loader2 size={13} className="spin" /> : <><Check size={13} /> {confirmText || 'Yes, Save'}</>}
                            </button>
                        </div>
                        <div style={{ marginTop: '14px', fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>
                            Enter = Save &nbsp;·&nbsp; Esc = Cancel
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
