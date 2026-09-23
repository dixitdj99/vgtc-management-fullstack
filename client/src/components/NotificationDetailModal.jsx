import React from 'react';
import { motion } from 'framer-motion';
import { Bell, Truck, AlertTriangle, CheckCircle, FileText, Sparkles, X, ExternalLink, Calendar, MapPin, Tag, User, ShieldAlert, CreditCard } from 'lucide-react';

export default function NotificationDetailModal({ notification, onClose, onNavigate }) {
  if (!notification) return null;

  const {
    type,
    title,
    message,
    lrNo,
    truckNo,
    loadingNo,
    source,
    destination,
    partyName,
    status,
    createdAt,
    document,
    documentLabel,
    expiryDate,
    newExpiryDate,
    metadata = {}
  } = notification;

  let IconComponent = Bell;
  let themeColor = '#6366f1';

  if (type === 'vehicle_loaded' || status === 'Loaded') {
    IconComponent = Truck;
    themeColor = '#10b981';
  } else if (type === 'vehicle_doc_expiry' || type === 'cashout_disputed') {
    IconComponent = AlertTriangle;
    themeColor = '#ef4444';
  } else if (type === 'vehicle_doc_updated' || type === 'cashout_confirmed' || type === 'online_advance_paid') {
    IconComponent = CheckCircle;
    themeColor = '#10b981';
  } else if (type === 'cashout_reversed') {
    IconComponent = Sparkles;
    themeColor = '#0ea5e9';
  }

  const formattedTime = createdAt
    ? new Date(createdAt).toLocaleString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      })
    : 'Recently';

  // Determine deep-link redirection target tab & search parameter
  const getRedirectTarget = () => {
    const searchVal = truckNo || lrNo || metadata.voucherNo || metadata.entryId || '';
    
    if (type === 'vehicle_loaded' || type?.includes('lr') || lrNo) {
      return { active: 'lr_dump', search: searchVal };
    }
    if (type?.includes('cashout') || type?.includes('cashbook') || type?.includes('deposit')) {
      return { active: 'balance_dump', subActive: 'cashbook', search: searchVal };
    }
    if (type?.includes('vehicle_doc') || type?.includes('vehicle') || truckNo) {
      return { active: 'vehicles_main', search: searchVal };
    }
    if (type?.includes('online_advance') || type?.includes('voucher')) {
      return { active: 'voucher_dump', search: searchVal };
    }
    if (type?.includes('labour')) {
      return { active: 'admin_loading_status_jharli' };
    }

    return { active: 'lr_dump', search: searchVal };
  };

  const handleRedirect = () => {
    const target = getRedirectTarget();
    if (onNavigate) {
      onNavigate(target);
    } else {
      window.dispatchEvent(new CustomEvent('nav-module', {
        detail: {
          active: target.active,
          subActive: target.subActive,
          search: target.search
        }
      }));
    }
    onClose();
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 10000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'rgba(0, 0, 0, 0.75)',
      backdropFilter: 'blur(8px)',
      padding: '16px'
    }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        style={{
          width: '100%',
          maxWidth: '540px',
          background: 'var(--bg-card, #1e293b)',
          border: '1px solid var(--border, #334155)',
          borderRadius: '20px',
          boxShadow: '0 25px 60px rgba(0, 0, 0, 0.4)',
          overflow: 'hidden'
        }}
      >
        {/* Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid var(--border, #334155)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--bg-th, rgba(255,255,255,0.02))'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '42px',
              height: '42px',
              borderRadius: '12px',
              background: themeColor + '18',
              color: themeColor,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 15px ' + themeColor + '20'
            }}>
              <IconComponent size={22} />
            </div>
            <div>
              <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text, #f8fafc)' }}>
                {title || 'Notification Details'}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted, #94a3b8)', marginTop: '2px' }}>
                {formattedTime}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted, #94a3b8)',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '8px'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '18px', maxHeight: '65vh', overflowY: 'auto' }}>
          
          {/* Main Message Box */}
          <div style={{
            padding: '14px 16px',
            borderRadius: '12px',
            background: 'var(--bg-input, rgba(15, 23, 42, 0.6))',
            border: '1px solid var(--border, #334155)',
            fontSize: '13px',
            lineHeight: 1.6,
            color: 'var(--text, #e2e8f0)'
          }}>
            {message}
          </div>

          {/* Structured Detail Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '12px'
          }}>
            {truckNo && (
              <div style={detailBoxStyle}>
                <Truck size={14} color={themeColor} />
                <div>
                  <div style={detailLabelStyle}>Truck Number</div>
                  <div style={detailValueStyle}>{truckNo}</div>
                </div>
              </div>
            )}

            {(lrNo || loadingNo) && (
              <div style={detailBoxStyle}>
                <Tag size={14} color={themeColor} />
                <div>
                  <div style={detailLabelStyle}>LR / Token Number</div>
                  <div style={detailValueStyle}>
                    {lrNo ? `LR #${lrNo}` : ''} {loadingNo ? `(Token #${loadingNo})` : ''}
                  </div>
                </div>
              </div>
            )}

            {(documentLabel || document) && (
              <div style={detailBoxStyle}>
                <FileText size={14} color={themeColor} />
                <div>
                  <div style={detailLabelStyle}>Document</div>
                  <div style={detailValueStyle}>{documentLabel || document}</div>
                </div>
              </div>
            )}

            {(expiryDate || newExpiryDate) && (
              <div style={detailBoxStyle}>
                <Calendar size={14} color={themeColor} />
                <div>
                  <div style={detailLabelStyle}>Expiry Date</div>
                  <div style={detailValueStyle}>{newExpiryDate || expiryDate}</div>
                </div>
              </div>
            )}

            {partyName && (
              <div style={detailBoxStyle}>
                <User size={14} color={themeColor} />
                <div>
                  <div style={detailLabelStyle}>Party Name</div>
                  <div style={detailValueStyle}>{partyName}</div>
                </div>
              </div>
            )}

            {(source || destination) && (
              <div style={detailBoxStyle}>
                <MapPin size={14} color={themeColor} />
                <div>
                  <div style={detailLabelStyle}>Route / Location</div>
                  <div style={detailValueStyle}>
                    {source || 'Plant'} → {destination || '—'}
                  </div>
                </div>
              </div>
            )}

            {status && (
              <div style={detailBoxStyle}>
                <ShieldAlert size={14} color={themeColor} />
                <div>
                  <div style={detailLabelStyle}>Status</div>
                  <div style={{ ...detailValueStyle, color: themeColor, fontWeight: 800 }}>{status}</div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div style={{
          padding: '16px 24px',
          borderTop: '1px solid var(--border, #334155)',
          display: 'flex',
          gap: '12px',
          justifyContent: 'flex-end',
          background: 'var(--bg-th, rgba(0,0,0,0.1))'
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '10px 18px',
              borderRadius: '10px',
              background: 'var(--bg-input, rgba(255,255,255,0.06))',
              border: '1px solid var(--border, #334155)',
              color: 'var(--text, #cbd5e1)',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            Close
          </button>

          <button
            onClick={handleRedirect}
            style={{
              padding: '10px 20px',
              borderRadius: '10px',
              background: themeColor,
              border: 'none',
              color: '#ffffff',
              fontSize: '13px',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 4px 15px ' + themeColor + '40'
            }}
          >
            <ExternalLink size={15} />
            <span>Go to Record Page / View Update</span>
          </button>
        </div>
      </motion.div>
    </div>
  );
}

const detailBoxStyle = {
  padding: '10px 14px',
  borderRadius: '10px',
  background: 'var(--bg-input, rgba(15, 23, 42, 0.4))',
  border: '1px solid var(--border-row, rgba(255,255,255,0.06))',
  display: 'flex',
  alignItems: 'center',
  gap: '10px'
};

const detailLabelStyle = {
  fontSize: '10px',
  fontWeight: 700,
  textTransform: 'uppercase',
  color: 'var(--text-muted, #94a3b8)',
  letterSpacing: '0.04em'
};

const detailValueStyle = {
  fontSize: '13px',
  fontWeight: 700,
  color: 'var(--text, #f1f5f9)',
  marginTop: '1px'
};
