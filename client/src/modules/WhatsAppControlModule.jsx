import React, { useState, useEffect } from 'react';
import ax from '../api';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MessageSquare, Send, RefreshCw, CheckCircle2, XCircle, AlertTriangle,
  Settings, Loader2, Sparkles, Zap, Eye, EyeOff, Phone, Key,
  Copy, Check, ExternalLink, ShieldCheck
} from 'lucide-react';
import TruckLoader from '../components/TruckLoader';
import '../pages/admin/admin.css';

const DEFAULT_PHONE_NUMBER_ID = '1216388781567509';
const DEFAULT_WABA_ID = '923120010444696';
const DEFAULT_ACCESS_TOKEN = 'EAAUUTeoUlMMBSYMeQWovzpVpJHEYRw1uZBRhTVbRDj3wVVA5mYZCAZBJvLTGKi2nS5T4tWawSwc8UZBrlI0L35CZAgwQZCag4GAkXmcm7Ftj1HoKLS9ZCl1tBJgUoqmO3UJN2juNMAfiF4zYlxAammX8SBFDVcS5JZCuU5PZAkv8oAM4zUMYfmhZB1jNZA9as9CcEZA21gZDZD';
const DEFAULT_VERIFY_TOKEN = 'vgtc_meta_verify_token_2026';
const DEFAULT_ADMIN_PHONES = '8708032492, 9416319445, 9728954901, 9728284849';

export default function WhatsAppControlModule() {
  const [config, setConfig] = useState({
    enabled: false,
    provider: 'meta',
    phoneNumberId: DEFAULT_PHONE_NUMBER_ID,
    wabaId: DEFAULT_WABA_ID,
    accessToken: DEFAULT_ACCESS_TOKEN,
    webhookVerifyToken: DEFAULT_VERIFY_TOKEN,
    adminPhone: '8708032492',
    adminPhonesStr: DEFAULT_ADMIN_PHONES,
    payloadFormat: 'meta',
    events: {
      lr_created_owner: { enabled: true, template: '' },
      lr_created_driver: { enabled: true, template: '' },
      voucher_created_owner: { enabled: true, template: '' },
      voucher_created_driver: { enabled: true, template: '' },
      online_advance_clerk: { enabled: true, template: '' },
      online_advance_paid_owner: { enabled: true, template: '' },
      online_advance_paid_driver: { enabled: true, template: '' },
      balance_paid: { enabled: true, template: '' },
      cashout: { enabled: true, template: '' },
      deposit: { enabled: true, template: '' }
    }
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [copiedField, setCopiedField] = useState(null);

  const [status, setStatus] = useState({
    checking: true,
    connected: false,
    message: '',
    verifiedName: '',
    displayPhoneNumber: ''
  });

  const [testForm, setTestForm] = useState({
    phone: '8708032492',
    message: ''
  });
  const [testResult, setTestResult] = useState(null);

  const [previews, setPreviews] = useState({});
  const [previewingKey, setPreviewingKey] = useState(null);
  const [notifyState, setNotifyState] = useState(null);

  const showToast = (type, message) => {
    setNotifyState({ type, message });
    setTimeout(() => setNotifyState(null), 4500);
  };

  const copyToClipboard = (text, fieldName) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    showToast('success', `Copied ${fieldName} to clipboard!`);
    setTimeout(() => setCopiedField(null), 2500);
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    setLoading(true);
    try {
      const res = await ax.get('/whatsapp/config');
      if (res.data) {
        setConfig(prev => ({
          ...prev,
          ...res.data,
          enabled: res.data.enabled !== undefined ? !!res.data.enabled : false,
          phoneNumberId: (res.data.phoneNumberId || DEFAULT_PHONE_NUMBER_ID).trim(),
          wabaId: (res.data.wabaId || DEFAULT_WABA_ID).trim(),
          accessToken: (res.data.accessToken || DEFAULT_ACCESS_TOKEN).trim(),
          webhookVerifyToken: (res.data.webhookVerifyToken || DEFAULT_VERIFY_TOKEN).trim(),
          adminPhone: res.data.adminPhone || '8708032492',
          adminPhonesStr: Array.isArray(res.data.adminPhones) && res.data.adminPhones.length > 0
            ? res.data.adminPhones.join(', ')
            : (res.data.adminPhonesStr || DEFAULT_ADMIN_PHONES),
          events: { ...prev.events, ...(res.data.events || {}) }
        }));
      }
    } catch (e) {
      console.error('Failed to fetch WhatsApp config', e);
    } finally {
      setLoading(false);
      checkConnection();
    }
  };

  const checkConnection = async () => {
    setStatus(prev => ({ ...prev, checking: true, message: 'Validating Meta Cloud API credentials...' }));
    try {
      const res = await ax.get('/whatsapp/status');
      setStatus({
        checking: false,
        connected: res.data?.connected || false,
        message: res.data?.message || (res.data?.connected ? 'Meta Cloud API Online & Verified' : 'Setup Required'),
        verifiedName: res.data?.verifiedName || '',
        displayPhoneNumber: res.data?.displayPhoneNumber || ''
      });
    } catch (e) {
      setStatus({
        checking: false,
        connected: false,
        message: e.response?.data?.message || 'Meta Cloud API Unreachable',
        verifiedName: '',
        displayPhoneNumber: ''
      });
    }
  };

  const handleToggle = async (forcedVal = null) => {
    const nextState = forcedVal !== null ? forcedVal : !config.enabled;
    // Optimistic UI update
    setConfig(prev => ({ ...prev, enabled: nextState }));
    setToggling(true);

    try {
      let res;
      try {
        res = await ax.post('/whatsapp/toggle', { enabled: nextState });
      } catch (err) {
        // Fallback to /config in case server has not reloaded /toggle route
        res = await ax.post('/whatsapp/config', { ...config, enabled: nextState });
      }
      const finalVal = res.data?.enabled !== undefined ? res.data.enabled : nextState;
      setConfig(prev => ({ ...prev, enabled: finalVal }));
      showToast(
        finalVal ? 'success' : 'info',
        finalVal
          ? '🟢 WhatsApp Messages are now LIVE (Enabled)'
          : '🔴 WhatsApp Messages TURNED OFF (Muted — Meta Verification Pending)'
      );
    } catch (err) {
      // Revert optimistic update on hard error
      setConfig(prev => ({ ...prev, enabled: !nextState }));
      showToast('error', 'Failed to toggle status: ' + (err.response?.data?.error || err.message));
    } finally {
      setToggling(false);
    }
  };

  const handleSaveConfig = async (e) => {
    e?.preventDefault();
    setSaving(true);
    try {
      const adminPhonesArr = (config.adminPhonesStr || config.adminPhone || '8708032492')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);

      const payload = {
        ...config,
        provider: 'meta',
        phoneNumberId: (config.phoneNumberId || DEFAULT_PHONE_NUMBER_ID).trim(),
        wabaId: (config.wabaId || DEFAULT_WABA_ID).trim(),
        accessToken: (config.accessToken || DEFAULT_ACCESS_TOKEN).trim(),
        webhookVerifyToken: (config.webhookVerifyToken || DEFAULT_VERIFY_TOKEN).trim(),
        adminPhone: adminPhonesArr[0] || '8708032492',
        adminPhones: adminPhonesArr,
        payloadFormat: 'meta'
      };
      await ax.post('/whatsapp/config', payload);
      showToast('success', '✅ Meta WhatsApp Configuration Saved Successfully!');
      checkConnection();
    } catch (err) {
      showToast('error', err.response?.data?.error || 'Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  const handleSendTestMsg = async (e) => {
    e.preventDefault();
    if (!testForm.phone) return showToast('error', 'Please enter a mobile number');
    setTesting(true);
    setTestResult(null);
    try {
      const res = await ax.post('/whatsapp/test', {
        phone: testForm.phone,
        message: testForm.message
      });
      setTestResult({ success: true, data: res.data });
      showToast('success', '✅ Test WhatsApp Message dispatched via Meta Cloud API!');
      checkConnection();
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'Meta WhatsApp dispatch failed';
      setTestResult({ success: false, error: msg });
      showToast('error', '❌ Dispatch Failed: ' + msg);
    } finally {
      setTesting(false);
    }
  };

  const handlePreviewTemplate = async (eventKey) => {
    setPreviewingKey(eventKey);
    try {
      const res = await ax.get(`/whatsapp/preview/${eventKey}`);
      setPreviews(p => ({ ...p, [eventKey]: res.data.preview }));
    } catch (e) {
      setPreviews(p => ({ ...p, [eventKey]: '⚠️ Preview failed: ' + (e.response?.data?.error || e.message) }));
    } finally {
      setPreviewingKey(null);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', width: '100%' }}>
        <TruckLoader size={120} text="Loading WhatsApp Meta Module..." />
      </div>
    );
  }

  return (
    <div className="adm adm-page" style={{ paddingBottom: '50px' }}>
      {/* Floating Toast Notification Banner */}
      <AnimatePresence>
        {notifyState && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            style={{
              position: 'fixed', top: '24px', right: '24px', zIndex: 9999,
              background: notifyState.type === 'success' ? '#10b981' : notifyState.type === 'info' ? '#6366f1' : '#f43f5e',
              color: '#ffffff', padding: '14px 22px', borderRadius: '12px',
              fontSize: '13.5px', fontWeight: 700, boxShadow: '0 12px 35px rgba(0,0,0,0.35)',
              display: 'flex', alignItems: 'center', gap: '10px'
            }}
          >
            {notifyState.type === 'success' ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
            <span>{notifyState.message}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Page Header */}
      <div className="adm-head" style={{ alignItems: 'center', flexWrap: 'wrap', gap: '14px', marginBottom: '20px' }}>
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span className="adm-icon-tile" style={{ background: '#25D366', color: '#fff' }}>
              <MessageSquare size={20} />
            </span>
            Meta WhatsApp Module
          </h1>
          <p style={{ marginTop: '4px' }}>
            Automated WhatsApp notifications for Loading Receipts, Vouchers, Cashbook &amp; Advances
          </p>
        </div>
        <div className="adm-head-actions" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            type="button"
            className="adm-btn adm-btn--sm"
            onClick={checkConnection}
            disabled={status.checking}
          >
            <RefreshCw size={13} className={status.checking ? 'adm-spin' : ''} />
            {status.checking ? 'Checking...' : 'Check Status'}
          </button>
        </div>
      </div>

      {/* ── PROMINENT MASTER ON / OFF TOGGLE BANNER ── */}
      <div style={{
        marginBottom: '24px',
        borderRadius: '16px',
        padding: '20px 24px',
        background: config.enabled ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.12), rgba(16, 185, 129, 0.05))' : 'linear-gradient(135deg, rgba(239, 68, 68, 0.12), rgba(239, 68, 68, 0.04))',
        border: `2px solid ${config.enabled ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.35)'}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '16px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: 1, minWidth: '300px' }}>
          <div style={{
            background: config.enabled ? '#10b981' : '#ef4444',
            color: '#fff',
            borderRadius: '50%',
            padding: '12px',
            display: 'flex',
            boxShadow: `0 4px 14px ${config.enabled ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)'}`
          }}>
            {config.enabled ? <CheckCircle2 size={24} /> : <AlertTriangle size={24} />}
          </div>
          <div>
            <div style={{ fontSize: '16px', fontWeight: 800, color: config.enabled ? '#10b981' : '#ef4444', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>WHATSAPP MESSAGES:</span>
              <span style={{ textTransform: 'uppercase', textDecoration: 'underline' }}>
                {config.enabled ? 'LIVE (TURNED ON)' : 'MUTED (TURNED OFF)'}
              </span>
            </div>
            <div style={{ fontSize: '13px', color: 'var(--text-sub)', marginTop: '4px', lineHeight: 1.5 }}>
              {config.enabled
                ? 'Outbound notifications will be dispatched via Meta WhatsApp Cloud API.'
                : 'Business is not approved on Meta yet. Outbound notifications are safely paused so system operations proceed smoothly without errors.'}
            </div>
          </div>
        </div>

        {/* Big Clickable Switch & Toggle Action Button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <button
            type="button"
            className="adm-btn adm-btn--sm"
            onClick={() => handleToggle()}
            disabled={toggling}
            style={{
              fontWeight: 800,
              padding: '10px 18px',
              fontSize: '13px',
              borderRadius: '8px',
              background: config.enabled ? '#ef4444' : '#10b981',
              color: '#ffffff',
              border: 'none',
              cursor: 'pointer'
            }}
          >
            {toggling ? <Loader2 size={15} className="adm-spin" /> : config.enabled ? 'Turn OFF Messages' : 'Turn ON Messages'}
          </button>
          <button
            type="button"
            role="switch"
            aria-checked={config.enabled}
            disabled={toggling}
            className="adm-switch"
            onClick={() => handleToggle()}
            title="Toggle WhatsApp On / Off"
            style={{ transform: 'scale(1.2)' }}
          />
        </div>
      </div>

      {/* Grid: Credentials & Live Test Message */}
      <div className="adm-grid-2" style={{ gap: '20px' }}>
        {/* Panel 1: Meta Cloud API Credentials (Pre-filled) */}
        <section className="adm-panel">
          <header className="adm-panel-hd">
            <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
              <span className="adm-icon-tile" style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6' }}>
                <Key size={18} />
              </span>
              <div>
                <h2>Meta Cloud API Credentials</h2>
                <p className="adm-sub">Pre-filled credentials for Vikas Goods Transport Co.</p>
              </div>
            </div>
          </header>

          <form onSubmit={handleSaveConfig} className="adm-panel-bd adm-sec" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {/* Phone Number ID */}
            <div className="adm-field">
              <label htmlFor="wa-phone-id">Phone Number ID</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  id="wa-phone-id"
                  type="text"
                  className="adm-input"
                  value={config.phoneNumberId || ''}
                  onChange={e => setConfig({ ...config, phoneNumberId: e.target.value })}
                  required
                />
                <button
                  type="button"
                  className="adm-btn adm-btn--secondary adm-btn--sm"
                  onClick={() => copyToClipboard(config.phoneNumberId, 'Phone Number ID')}
                >
                  {copiedField === 'Phone Number ID' ? <Check size={14} style={{ color: '#10b981' }} /> : <Copy size={14} />}
                </button>
              </div>
            </div>

            {/* WABA ID */}
            <div className="adm-field">
              <label htmlFor="wa-waba-id">WhatsApp Business Account (WABA) ID</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  id="wa-waba-id"
                  type="text"
                  className="adm-input"
                  value={config.wabaId || ''}
                  onChange={e => setConfig({ ...config, wabaId: e.target.value })}
                  required
                />
                <button
                  type="button"
                  className="adm-btn adm-btn--secondary adm-btn--sm"
                  onClick={() => copyToClipboard(config.wabaId, 'WABA ID')}
                >
                  {copiedField === 'WABA ID' ? <Check size={14} style={{ color: '#10b981' }} /> : <Copy size={14} />}
                </button>
              </div>
            </div>

            {/* Permanent Access Token */}
            <div className="adm-field">
              <label htmlFor="wa-token">Permanent Meta Access Token</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  id="wa-token"
                  type={showToken ? 'text' : 'password'}
                  className="adm-input"
                  value={config.accessToken || ''}
                  onChange={e => setConfig({ ...config, accessToken: e.target.value })}
                  required
                  style={{ fontFamily: 'monospace', fontSize: '12px' }}
                />
                <button
                  type="button"
                  className="adm-btn adm-btn--secondary adm-btn--sm"
                  onClick={() => setShowToken(!showToken)}
                  title={showToken ? 'Hide token' : 'Show token'}
                >
                  {showToken ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
                <button
                  type="button"
                  className="adm-btn adm-btn--secondary adm-btn--sm"
                  onClick={() => copyToClipboard(config.accessToken, 'Access Token')}
                >
                  {copiedField === 'Access Token' ? <Check size={14} style={{ color: '#10b981' }} /> : <Copy size={14} />}
                </button>
              </div>
            </div>

            {/* Admin WhatsApp Numbers */}
            <div className="adm-field">
              <label htmlFor="wa-admins">Admin Alert Numbers (Comma-separated)</label>
              <input
                id="wa-admins"
                type="text"
                className="adm-input"
                placeholder="e.g. 8708032492, 9416319445"
                value={config.adminPhonesStr || ''}
                onChange={e => setConfig({ ...config, adminPhonesStr: e.target.value })}
              />
              <span className="adm-hint">Cashbook deposit and cashout alerts are sent to these numbers.</span>
            </div>

            <button type="submit" className="adm-btn adm-btn--primary adm-btn--block" disabled={saving}>
              {saving ? <Loader2 size={15} className="adm-spin" /> : <><Sparkles size={15} /> Save Credentials</>}
            </button>
          </form>
        </section>

        {/* Panel 2: Live Test Dispatch */}
        <section className="adm-panel">
          <header className="adm-panel-hd">
            <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
              <span className="adm-icon-tile" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>
                <Send size={18} />
              </span>
              <div>
                <h2>Send Test WhatsApp Message</h2>
                <p className="adm-sub">Verify delivery to a mobile phone</p>
              </div>
            </div>
          </header>

          <form onSubmit={handleSendTestMsg} className="adm-panel-bd adm-sec" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div className="adm-field">
              <label htmlFor="wa-test-phone">Recipient Phone Number <span className="adm-req">*</span></label>
              <input
                id="wa-test-phone"
                type="text"
                className="adm-input"
                placeholder="e.g. 8708032492 or 9876543210"
                value={testForm.phone}
                onChange={e => setTestForm({ ...testForm, phone: e.target.value })}
                required
              />
            </div>

            <div className="adm-field">
              <label htmlFor="wa-test-msg">Custom Message (Optional)</label>
              <textarea
                id="wa-test-msg"
                className="adm-textarea"
                rows={4}
                placeholder="Leave blank to send standard VGTC test verification message..."
                value={testForm.message}
                onChange={e => setTestForm({ ...testForm, message: e.target.value })}
              />
            </div>

            <button type="submit" className="adm-btn adm-btn--primary adm-btn--block" disabled={testing}>
              {testing ? <Loader2 size={15} className="adm-spin" /> : <><Send size={15} /> Dispatch Test Message</>}
            </button>

            {testResult && (
              <div className={`adm-note ${testResult.success ? 'adm-note--success' : 'adm-note--danger'}`} style={{ marginTop: '8px' }}>
                <div>
                  <strong>{testResult.success ? '✅ Test Message Dispatched Successfully' : '❌ Message Dispatch Failed'}</strong>
                  <div style={{ fontSize: '11px', fontFamily: 'monospace', marginTop: '3px' }}>
                    {testResult.success ? 'Message sent via Meta WhatsApp Cloud API' : testResult.error}
                  </div>
                </div>
              </div>
            )}
          </form>
        </section>
      </div>

      {/* ── SECTION 3: AUTOMATED EVENT MESSAGE TEMPLATES ── */}
      <section className="adm-panel" style={{ marginTop: '24px' }}>
        <header className="adm-panel-hd" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
            <span className="adm-icon-tile" style={{ background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b' }}>
              <Zap size={18} />
            </span>
            <div>
              <h2>Automated Notification Templates</h2>
              <p className="adm-sub">Customize WhatsApp text dispatched on business events</p>
            </div>
          </div>
          <button type="button" onClick={handleSaveConfig} className="adm-btn adm-btn--primary adm-btn--sm" disabled={saving}>
            {saving ? <Loader2 size={14} className="adm-spin" /> : <><Sparkles size={14} /> Save Templates</>}
          </button>
        </header>

        <div className="adm-panel-bd adm-sec" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {[
            { key: 'lr_created_owner', title: '1. Loading Slip (LR) — Truck Owner', tags: '{lrNo} {truckNo} {date} {partyName} {destination} {totalBags} {totalWeight} {materialsText}' },
            { key: 'lr_created_driver', title: '2. Trip Dispatch — Driver Alert', tags: '{lrNo} {truckNo} {date} {destination} {totalBags} {totalWeight} {billing}' },
            { key: 'voucher_created_owner', title: '3. Freight Voucher — Truck Owner', tags: '{voucherNo} {lrNo} {truckNo} {destination} {grossFreight} {netBalance} {advanceDiesel} {advanceCash} {advanceOnline} {munshi} {commission}' },
            { key: 'voucher_created_driver', title: '4. Trip Cleared — Driver Copy', tags: '{voucherNo} {lrNo} {truckNo} {destination} {advanceDiesel} {advanceCash} {netBalance} {paymentStatus}' },
            { key: 'online_advance_paid_owner', title: '5. Online Advance Paid — Truck Owner', tags: '{voucherNo} {lrNo} {truckNo} {advanceOnline} {paidDate}' },
            { key: 'balance_paid', title: '6. Balance Payment Dispatched', tags: '{truckNo} {tripCount} {periodFrom} {periodTo}' },
            { key: 'deposit', title: '7. Cashbook Deposit Alert', tags: '{amount} {remark} {date}' },
            { key: 'cashout', title: '8. Cashbook Cash Out Alert', tags: '{entityName} {amount} {remark} {date}' }
          ].map(evt => {
            const evtConfig = config.events?.[evt.key] || { enabled: true, template: '' };
            const previewText = previews[evt.key];
            return (
              <div key={evt.key} style={{ background: 'var(--bg-th)', border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text)' }}>{evt.title}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px', fontFamily: 'monospace' }}>
                      Tags: {evt.tags}
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={evtConfig.enabled !== false}
                    className="adm-switch"
                    onClick={() => {
                      const updated = { ...config.events, [evt.key]: { ...evtConfig, enabled: evtConfig.enabled === false } };
                      setConfig({ ...config, events: updated });
                    }}
                  />
                </div>
                <div style={{ padding: '12px 16px' }}>
                  <textarea
                    className="adm-textarea"
                    rows={3}
                    value={evtConfig.template || ''}
                    onChange={e => {
                      const updated = { ...config.events, [evt.key]: { ...evtConfig, template: e.target.value } };
                      setConfig({ ...config, events: updated });
                    }}
                    style={{ fontFamily: 'monospace', fontSize: '12px' }}
                  />
                  <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button
                      type="button"
                      className="adm-btn adm-btn--sm"
                      onClick={() => handlePreviewTemplate(evt.key)}
                      disabled={previewingKey === evt.key}
                      style={{ fontSize: '11px', padding: '4px 10px' }}
                    >
                      {previewingKey === evt.key ? <Loader2 size={12} className="adm-spin" /> : <Eye size={12} />}
                      Preview Sample
                    </button>
                  </div>
                  {previewText && (
                    <div style={{
                      marginTop: '10px', background: 'var(--bg-inset)', border: '1px solid var(--border)',
                      borderRadius: '8px', padding: '12px 14px', fontSize: '11.5px',
                      fontFamily: 'monospace', whiteSpace: 'pre-wrap', color: 'var(--text)', lineHeight: 1.6
                    }}>
                      <div style={{ fontSize: '10px', fontWeight: 800, color: '#10b981', marginBottom: '4px' }}>📱 SAMPLE MESSAGE:</div>
                      {previewText}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
