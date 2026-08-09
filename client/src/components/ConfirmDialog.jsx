import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Trash2, X, CheckCircle2, Info } from 'lucide-react';

/**
 * Reusable confirm dialog that matches the admin dark theme.
 * Replaces native window.confirm() with a styled, consistent modal.
 *
 * Props:
 *   open       {boolean}        - whether the dialog is visible
 *   title      {string}         - dialog heading
 *   message    {string|node}    - body text (can include <strong> etc.)
 *   confirmText{string}         - confirm button label (default "Confirm")
 *   confirmIcon{component}      - icon inside confirm button (default Trash2)
 *   cancelText {string}         - cancel button label (default "Cancel")
 *   danger     {boolean}        - red/danger styling for confirm button (default true)
 *   busy       {boolean}        - show loading state on confirm button
 *   onConfirm  {function}       - called when user confirms
 *   onCancel   {function}       - called when user cancels / closes
 */
export default function ConfirmDialog({
  open,
  title = 'Are you sure?',
  message = 'This action cannot be undone.',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  danger = true,
  busy = false,
  onConfirm,
  onCancel,
}) {
  const [leaving, setLeaving] = useState(false);

  const handleConfirm = async () => {
    if (!onConfirm) return;
    setLeaving(true);
    try {
      await onConfirm();
    } catch {
      // Swallow — caller handles errors
    } finally {
      setLeaving(false);
    }
  };

  const accent = danger ? '#ef4444' : '#6366f1';
  const accentLight = danger ? 'rgba(239,68,68,0.12)' : 'rgba(99,102,241,0.12)';
  const Icon = danger ? AlertTriangle : Info;

  return (
    <AnimatePresence>
      {open && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)',
          }}
          onClick={(e) => { if (e.target === e.currentTarget) onCancel?.(); }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 10 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            style={{
              width: '90%', maxWidth: '360px',
              background: 'var(--bg-card, #1e293b)',
              border: `1px solid ${danger ? 'rgba(244,63,94,0.25)' : 'rgba(99,102,241,0.25)'}`,
              borderRadius: '16px', padding: '28px 24px',
              boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
            }}
          >
            {/* Close button */}
            <button
              onClick={onCancel}
              style={{
                position: 'absolute', top: '12px', right: '12px',
                background: 'none', border: 'none', color: 'var(--text-muted, #94a3b8)',
                cursor: 'pointer', padding: '4px', display: 'flex',
              }}
              aria-label="Close"
            >
              <X size={16} />
            </button>

            {/* Icon */}
            <div style={{
              width: '52px', height: '52px', borderRadius: '14px',
              background: accentLight, display: 'flex', alignItems: 'center',
              justifyContent: 'center', margin: '0 auto 16px',
            }}>
              <Icon size={26} color={accent} />
            </div>

            {/* Title */}
            <div style={{
              fontSize: '16px', fontWeight: 800, color: 'var(--text, #f1f5f9)',
              marginBottom: '8px', textAlign: 'center',
            }}>
              {title}
            </div>

            {/* Message */}
            <div style={{
              fontSize: '12.5px', color: 'var(--text-muted, #94a3b8)',
              marginBottom: '22px', textAlign: 'center', lineHeight: 1.5,
            }}>
              {message}
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={onCancel}
                disabled={busy || leaving}
                style={{
                  flex: 1, padding: '11px 16px', borderRadius: '10px',
                  border: '1px solid var(--border, rgba(255,255,255,0.12))',
                  background: 'rgba(255,255,255,0.05)',
                  color: 'var(--text, #f1f5f9)', fontSize: '13px', fontWeight: 700,
                  cursor: 'pointer', transition: 'all 0.15s',
                  opacity: (busy || leaving) ? 0.6 : 1,
                }}
              >
                {cancelText}
              </button>
              <button
                onClick={handleConfirm}
                disabled={busy || leaving}
                style={{
                  flex: 1, padding: '11px 16px', borderRadius: '10px',
                  border: 'none', background: accent, color: 'white',
                  fontSize: '13px', fontWeight: 700,
                  cursor: 'pointer', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', gap: '6px', transition: 'all 0.15s',
                  boxShadow: `0 6px 16px ${accent}40`,
                  opacity: (busy || leaving) ? 0.7 : 1,
                }}
              >
                {(busy || leaving) ? (
                  <span className="ani-spin" style={{ display: 'inline-block' }}>
                    <CheckCircle2 size={14} />
                  </span>
                ) : (
                  <Trash2 size={13} />
                )}
                {confirmText}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
