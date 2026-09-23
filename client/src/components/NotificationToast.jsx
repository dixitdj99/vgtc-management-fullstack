import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, Truck, AlertTriangle, CheckCircle, FileText, X, ArrowRight, Sparkles } from 'lucide-react';

export default function NotificationToast({ notification, onClose, onClickDetail }) {
  if (!notification) return null;

  const { type, title, message, createdAt, status } = notification;

  let IconComponent = Bell;
  let iconBg = 'rgba(99, 102, 241, 0.15)';
  let iconColor = '#6366f1';

  if (type === 'vehicle_loaded' || status === 'Loaded') {
    IconComponent = Truck;
    iconBg = 'rgba(16, 185, 129, 0.15)';
    iconColor = '#10b981';
  } else if (type === 'vehicle_doc_expiry' || type === 'cashout_disputed') {
    IconComponent = AlertTriangle;
    iconBg = 'rgba(239, 68, 68, 0.15)';
    iconColor = '#ef4444';
  } else if (type === 'vehicle_doc_updated' || type === 'cashout_confirmed' || type === 'online_advance_paid') {
    IconComponent = CheckCircle;
    iconBg = 'rgba(16, 185, 129, 0.15)';
    iconColor = '#10b981';
  } else if (type === 'cashout_reversed') {
    IconComponent = Sparkles;
    iconBg = 'rgba(14, 165, 233, 0.15)';
    iconColor = '#0ea5e9';
  }

  const timeStr = createdAt
    ? new Date(createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    : 'Just now';

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.95 }}
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          zIndex: 9999,
          width: '360px',
          maxWidth: 'calc(100vw - 32px)',
          background: 'var(--bg-card, #1e293b)',
          border: `1px solid ${iconColor}40`,
          borderRadius: '16px',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.35), 0 0 20px ' + iconColor + '20',
          backdropFilter: 'blur(12px)',
          overflow: 'hidden',
          cursor: 'pointer'
        }}
        onClick={() => onClickDetail(notification)}
      >
        <div style={{ padding: '14px 16px', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
          <div style={{
            width: '36px',
            height: '36px',
            borderRadius: '10px',
            background: iconBg,
            color: iconColor,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            marginTop: '2px'
          }}>
            <IconComponent size={18} />
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '3px' }}>
              <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text, #f8fafc)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {title || 'System Notification'}
              </span>
              <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted, #94a3b8)', flexShrink: 0 }}>
                {timeStr}
              </span>
            </div>

            <p style={{ fontSize: '11.5px', color: 'var(--text-sub, #cbd5e1)', margin: '0 0 8px 0', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {message}
            </p>

            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: 800, color: iconColor }}>
              <span>View Full Details & Page Link</span>
              <ArrowRight size={12} />
            </div>
          </div>

          <button
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted, #94a3b8)',
              cursor: 'pointer',
              padding: '2px',
              borderRadius: '6px',
              display: 'flex'
            }}
          >
            <X size={15} />
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
