import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react';

const ToastContext = createContext(null);
export const useToast = () => useContext(ToastContext);

// Store ref for global access (used by alert override)
let globalShowToast = null;

const ICONS = {
  success: { Icon: CheckCircle2, bg: '#10b981', light: 'rgba(16,185,129,0.1)', border: 'rgba(16,185,129,0.25)' },
  error:   { Icon: XCircle,      bg: '#ef4444', light: 'rgba(239,68,68,0.1)',  border: 'rgba(239,68,68,0.25)' },
  warning: { Icon: AlertTriangle, bg: '#f59e0b', light: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.25)' },
  info:    { Icon: Info,          bg: '#0A6ED1', light: 'rgba(10,110,209,0.1)',  border: 'rgba(10,110,209,0.25)' },
};

let toastId = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const showToast = useCallback((message, type = 'info', duration = 3500) => {
    const id = ++toastId;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), duration);
  }, []);

  const dismiss = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // Override window.alert to use toast instead
  useEffect(() => {
    globalShowToast = showToast;
    const originalAlert = window._originalAlert || window.alert;
    window._originalAlert = originalAlert;
    window.alert = (msg) => {
      const str = String(msg || '');
      const lower = str.toLowerCase();
      let type = 'info';
      if (lower.includes('success') || lower.includes('created') || lower.includes('saved') || lower.includes('deleted') || lower.includes('updated') || lower.includes('sent') || str.startsWith('Receipt #') || str.startsWith('Fleet status') || str.startsWith('Alert report')) type = 'success';
      else if (lower.includes('fail') || lower.includes('error') || lower.includes('denied') || lower.includes('invalid') || lower.includes('not enough')) type = 'error';
      else if (lower.includes('warning') || lower.includes('only') || lower.includes('permission')) type = 'warning';
      showToast(str, type, type === 'error' ? 5000 : 3500);
    };
    return () => { window.alert = originalAlert; };
  }, [showToast]);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div style={{ position: 'fixed', top: 16, right: 16, zIndex: 99999, display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'none', maxWidth: 380 }}>
        <AnimatePresence>
          {toasts.map(t => {
            const cfg = ICONS[t.type] || ICONS.info;
            const Icon = cfg.Icon;
            return (
              <motion.div
                key={t.id}
                initial={{ opacity: 0, x: 80, scale: 0.95 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 80, scale: 0.95 }}
                transition={{ type: 'spring', damping: 20, stiffness: 300 }}
                style={{
                  pointerEvents: 'auto',
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                  padding: '12px 14px',
                  background: 'var(--bg-card, #fff)',
                  border: `1px solid ${cfg.border}`,
                  borderLeft: `4px solid ${cfg.bg}`,
                  borderRadius: 8,
                  boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
                  minWidth: 280,
                }}
              >
                <div style={{ background: cfg.light, padding: 6, borderRadius: 6, display: 'flex', flexShrink: 0 }}>
                  <Icon size={16} color={cfg.bg} />
                </div>
                <div style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text, #1e293b)', lineHeight: 1.4, paddingTop: 2 }}>
                  {t.message}
                </div>
                <button onClick={() => dismiss(t.id)} style={{ background: 'none', border: 'none', padding: 2, cursor: 'pointer', color: 'var(--text-muted, #94a3b8)', display: 'flex', flexShrink: 0 }}>
                  <X size={14} />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
