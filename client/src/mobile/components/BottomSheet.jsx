import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

/**
 * Bottom sheet. Controlled by `open`. `onClose` should pop the nav sheet state.
 * Tapping the overlay or the X closes it.
 */
export default function BottomSheet({ open, title, onClose, children, footer }) {
    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    className="m-sheet-overlay"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    onClick={onClose}
                >
                    <motion.div
                        className="m-sheet"
                        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
                        transition={{ type: 'tween', duration: 0.24, ease: 'easeOut' }}
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="m-sheet-handle" />
                        <div className="m-sheet-head">
                            <span>{title}</span>
                            <button className="m-appbar-btn" style={{ background: 'var(--bg-input)', color: 'var(--text-muted)', width: 34, height: 34 }} onClick={onClose} aria-label="Close">
                                <X size={18} />
                            </button>
                        </div>
                        <div className="m-sheet-body">{children}</div>
                        {footer && <div className="m-sheet-foot">{footer}</div>}
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
