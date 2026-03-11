import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Check, X } from 'lucide-react';

export default function ConfirmSaveModal({ isOpen, onClose, onConfirm, title, message, isSaving, confirmText }) {
    return (
        <AnimatePresence>
            {isOpen && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)' }}>
                    <motion.div initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                        style={{ width: '360px', background: 'var(--bg-card)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: '16px', boxShadow: '0 24px 60px rgba(0,0,0,0.5)', padding: '28px 24px', textAlign: 'center' }}>
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
                            <button type="button" className="btn btn-p" onClick={onConfirm} disabled={isSaving}>
                                {isSaving ? 'Saving...' : <><Check size={13} /> {confirmText || 'Yes, Save'}</>}
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
