import React, { useState, useEffect } from 'react';
import ax from '../api';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MessageSquare, Send, RefreshCw, CheckCircle2, XCircle, AlertTriangle,
  Settings, Info, Loader2, Sparkles, Zap, Eye, EyeOff, Phone, Key,
  Copy, Check, ExternalLink, ShieldCheck, HelpCircle, Activity, Globe,
  Award, Layers, CheckSquare, Trash2, Users
} from 'lucide-react';
import TruckLoader from '../components/TruckLoader';
import '../pages/admin/admin.css';

const DEFAULT_VERIFY_TOKEN = 'vgtc_meta_verify_token_2026';

export default function WhatsAppControlModule() {
  const [config, setConfig] = useState({
    enabled: true,
    provider: 'meta',
    phoneNumberId: '',
    wabaId: '',
    accessToken: '',
    webhookVerifyToken: DEFAULT_VERIFY_TOKEN,
    adminPhone: '8708032492',
    adminPhonesStr: '8708032492',
    clerkPhone: '8708032492',
    labourPhones: '8708032492',
    payloadFormat: 'meta',
    events: {
      lr_created_owner: { enabled: true, template: '' },
      lr_created_driver: { enabled: true, template: '' },
      lr_loading_labour: { enabled: true, template: '' },
      lr_loaded_creator: { enabled: true, template: '' },
      voucher_created_owner: { enabled: true, template: '' },
      voucher_created_driver: { enabled: true, template: '' },
      voucher_action_creator: { enabled: true, template: '' },
      online_advance_clerk: { enabled: true, template: '' },
      online_advance_pending_reminder: { enabled: true, template: '' },
      online_advance_paid_owner: { enabled: true, template: '' },
      online_advance_paid_driver: { enabled: true, template: '' },
      balance_paid: { enabled: true, template: '' },
      cashout: { enabled: true, template: '' },
      deposit: { enabled: true, template: '' }
    }
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState({
    checking: true,
    connected: false,
    message: '',
    verifiedName: '',
    displayPhoneNumber: '',
    qualityRating: '',
    codeVerificationStatus: ''
  });

  const [showToken, setShowToken] = useState(false);
  const [copiedField, setCopiedField] = useState(null);
  const [activeTab, setActiveTab] = useState('credentials'); // 'credentials' | 'test' | 'templates' | 'guide'

  const [testForm, setTestForm] = useState({
    phone: '',
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

  // Derive public Webhook Callback URL
  const webhookUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/api/whatsapp/webhook`
    : 'https://unworn-sensitive-cinch.ngrok-free.dev/api/whatsapp/webhook';

  const copyToClipboard = (text, fieldName) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    showToast('success', `Copied ${fieldName} to clipboard!`);
    setTimeout(() => setCopiedField(null), 2500);
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

  const [logs, setLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [logFilter, setLogFilter] = useState('all'); // 'all' | 'outbound' | 'inbound_webhook' | 'failed'
  const [autoRefreshLogs, setAutoRefreshLogs] = useState(true);

  const fetchLogs = async () => {
    setLoadingLogs(true);
    try {
      const res = await ax.get('/whatsapp/logs?limit=150');
      if (res.data?.logs) {
        setLogs(res.data.logs);
      }
    } catch (e) {
      console.error('Failed to fetch WhatsApp logs', e);
    } finally {
      setLoadingLogs(false);
    }
  };

  const handleClearLogs = async () => {
    if (!window.confirm('Clear all WhatsApp activity and webhook logs?')) return;
    try {
      await ax.delete('/whatsapp/logs');
      setLogs([]);
      showToast('success', 'WhatsApp logs cleared successfully');
    } catch (e) {
      showToast('error', 'Failed to clear logs');
    }
  };

  useEffect(() => {
    if (activeTab === 'logs') {
      fetchLogs();
    }
  }, [activeTab]);

  useEffect(() => {
    let interval = null;
    if (activeTab === 'logs' && autoRefreshLogs) {
      interval = setInterval(fetchLogs, 5000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [activeTab, autoRefreshLogs]);

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
          phoneNumberId: (res.data.phoneNumberId || '').trim(),
          wabaId: (res.data.wabaId || '').trim(),
          accessToken: (res.data.accessToken || res.data.apiKey || '').trim(),
          webhookVerifyToken: (res.data.webhookVerifyToken || DEFAULT_VERIFY_TOKEN).trim(),
          adminPhone: res.data.adminPhone || '8708032492',
          adminPhonesStr: Array.isArray(res.data.adminPhones) && res.data.adminPhones.length > 0 ? res.data.adminPhones.join(', ') : (res.data.adminPhone || '8708032492'),
          clerkPhone: res.data.clerkPhone || '8708032492',
          labourPhones: res.data.labourPhones || '8708032492'
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
    setStatus(prev => ({ ...prev, checking: true, message: 'Pinging Meta WhatsApp Cloud API...' }));
    try {
      const res = await ax.get('/whatsapp/status');
      setStatus({
        checking: false,
        connected: res.data?.connected || false,
        message: res.data?.message || (res.data?.connected ? 'Meta Cloud API Online & Verified' : 'Disconnected'),
        verifiedName: res.data?.verifiedName || '',
        displayPhoneNumber: res.data?.displayPhoneNumber || '',
        qualityRating: res.data?.qualityRating || '',
        codeVerificationStatus: res.data?.codeVerificationStatus || ''
      });
    } catch (e) {
      setStatus({
        checking: false,
        connected: false,
        message: e.response?.data?.message || 'Meta Cloud API Unreachable',
        verifiedName: '',
        displayPhoneNumber: '',
        qualityRating: '',
        codeVerificationStatus: ''
      });
    }
  };

  const handleSaveConfig = async (e) => {
    e?.preventDefault();
    setSaving(true);
    try {
      let cleanToken = (config.accessToken || '').trim().replace(/^Bearer\s+/i, '').replace(/^['"]|['"]$/g, '');
      if (cleanToken.includes('TMkrg6UtaDyzH4TT3qnx6njnhEDBqsq4Hn')) {
        cleanToken = cleanToken.replace(/TMkrg6UtaDyzH4TT3qnx6njnhEDBqsq4Hn/g, '');
      }
      const adminPhonesArr = (config.adminPhonesStr || config.adminPhone || '8708032492')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);

      const payload = {
        ...config,
        provider: 'meta',
        phoneNumberId: (config.phoneNumberId || '').trim(),
        wabaId: (config.wabaId || '').trim(),
        accessToken: cleanToken,
        webhookVerifyToken: (config.webhookVerifyToken || DEFAULT_VERIFY_TOKEN).trim(),
        adminPhone: adminPhonesArr[0] || '8708032492',
        adminPhones: adminPhonesArr,
        clerkPhone: (config.clerkPhone || '8708032492').trim(),
        labourPhones: (config.labourPhones || '8708032492').trim(),
        payloadFormat: 'meta'
      };
      await ax.post('/whatsapp/config', payload);
      setConfig(prev => ({ ...prev, accessToken: cleanToken, adminPhonesStr: adminPhonesArr.join(', ') }));
      showToast('success', '✅ Meta Cloud API Settings Saved Successfully!');
      checkConnection();
    } catch (err) {
      showToast('error', err.response?.data?.error || 'Failed to save Meta configuration');
    } finally {
      setSaving(false);
    }
  };

  const handleSendTestMsg = async (e) => {
    e.preventDefault();
    if (!testForm.phone) return showToast('error', 'Please enter a recipient mobile number');
    setTesting(true);
    setTestResult(null);
    try {
      // Save credentials first to make sure server uses latest
      const payload = {
        ...config,
        provider: 'meta',
        phoneNumberId: (config.phoneNumberId || '').trim(),
        wabaId: (config.wabaId || '').trim(),
        accessToken: (config.accessToken || '').trim(),
        payloadFormat: 'meta'
      };
      await ax.post('/whatsapp/config', payload);

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

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', width: '100%' }}>
        <TruckLoader size={120} text="Connecting to Meta WhatsApp Business API..." />
      </div>
    );
  }

  const qualityColor = (status.qualityRating || '').toUpperCase() === 'GREEN'
    ? '#10b981'
    : (status.qualityRating || '').toUpperCase() === 'YELLOW'
    ? '#f59e0b'
    : '#64748b';

  return (
    <div className="adm adm-page" style={{ paddingBottom: '40px' }}>
      {/* Floating Toast Notification Banner */}
      <AnimatePresence>
        {notifyState && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            style={{
              position: 'fixed', top: '24px', right: '24px', zIndex: 9999,
              background: notifyState.type === 'success' ? '#10b981' : '#f43f5e',
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

      {/* Header */}
      <div className="adm-head">
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span className="adm-icon-tile" style={{ background: '#25D366', color: '#fff' }}>
              <MessageSquare size={20} />
            </span>
            Meta WhatsApp Business Control Center
          </h1>
          <p style={{ marginTop: '4px' }}>
            Official Meta WhatsApp Business Cloud API • Automated Notifications &amp; Webhooks
          </p>
        </div>
        <div className="adm-head-actions">
          <a
            href="https://developers.facebook.com/apps"
            target="_blank"
            rel="noreferrer"
            className="adm-btn adm-btn--secondary adm-btn--sm"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <ExternalLink size={13} /> Meta Developer Portal
          </a>
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

      {/* Live Status & Connection Banner */}
      <div
        className={`adm-note ${status.connected ? 'adm-note--success' : 'adm-note--danger'}`}
        style={{
          borderLeftWidth: '5px',
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          flexWrap: 'wrap'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: '280px' }}>
          {status.checking ? (
            <Loader2 size={24} className="adm-spin" />
          ) : status.connected ? (
            <div style={{ background: '#10b981', color: '#fff', borderRadius: '50%', padding: '6px', display: 'flex' }}>
              <CheckCircle2 size={22} />
            </div>
          ) : (
            <div style={{ background: '#f43f5e', color: '#fff', borderRadius: '50%', padding: '6px', display: 'flex' }}>
              <XCircle size={22} />
            </div>
          )}
          <div>
            <div style={{ fontSize: '14.5px', fontWeight: 800, letterSpacing: '0.3px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>Meta Cloud API:</span>
              <span style={{ color: status.connected ? '#10b981' : '#f43f5e' }}>
                {status.checking ? 'CONNECTING...' : status.connected ? 'ONLINE & AUTHENTICATED' : 'SETUP REQUIRED'}
              </span>
            </div>
            <div style={{ fontSize: '12px', opacity: 0.9, marginTop: '2px' }}>
              {status.message || 'Configure your Meta Phone Number ID and Permanent Access Token below.'}
            </div>
          </div>
        </div>

        {/* Live Meta Credentials Badges */}
        {status.connected && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            {status.verifiedName && (
              <div style={{
                background: 'rgba(16, 185, 129, 0.12)', border: '1px solid rgba(16, 185, 129, 0.3)',
                padding: '5px 12px', borderRadius: '8px', fontSize: '11.5px', fontWeight: 700,
                display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text)'
              }}>
                <ShieldCheck size={14} style={{ color: '#10b981' }} />
                <span>{status.verifiedName}</span>
              </div>
            )}
            {status.displayPhoneNumber && (
              <div style={{
                background: 'rgba(59, 130, 246, 0.12)', border: '1px solid rgba(59, 130, 246, 0.3)',
                padding: '5px 12px', borderRadius: '8px', fontSize: '11.5px', fontWeight: 700,
                display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text)'
              }}>
                <Phone size={13} style={{ color: '#3b82f6' }} />
                <span>{status.displayPhoneNumber}</span>
              </div>
            )}
            {status.qualityRating && (
              <div style={{
                background: 'rgba(245, 158, 11, 0.12)', border: '1px solid rgba(245, 158, 11, 0.3)',
                padding: '5px 12px', borderRadius: '8px', fontSize: '11.5px', fontWeight: 700,
                display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text)'
              }}>
                <Activity size={13} style={{ color: qualityColor }} />
                <span>Quality: {status.qualityRating}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Webhook Configuration Quick-Copy Card */}
      <div style={{
        marginTop: '16px',
        background: 'var(--bg-th)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--adm-r-sm)',
        padding: '16px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Globe size={16} style={{ color: 'var(--primary)' }} />
            <span style={{ fontSize: '13.5px', fontWeight: 800, color: 'var(--text)' }}>
              Meta Webhook Integration Endpoints
            </span>
          </div>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            Configure these in Meta App &gt; WhatsApp &gt; Configuration &gt; Webhook
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px' }}>
          {/* Webhook Callback URL */}
          <div style={{
            background: 'var(--bg-inset)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            padding: '10px 14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px'
          }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)', fontWeight: 700 }}>
                Webhook Callback URL (POST &amp; GET)
              </div>
              <div style={{ fontSize: '12px', fontFamily: 'monospace', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '2px' }}>
                {webhookUrl}
              </div>
            </div>
            <button
              type="button"
              className="adm-btn adm-btn--sm"
              onClick={() => copyToClipboard(webhookUrl, 'Webhook URL')}
              style={{ padding: '6px 10px', fontSize: '11px', flexShrink: 0 }}
            >
              {copiedField === 'Webhook URL' ? <Check size={13} style={{ color: '#10b981' }} /> : <Copy size={13} />}
              {copiedField === 'Webhook URL' ? 'Copied' : 'Copy'}
            </button>
          </div>

          {/* Webhook Verify Token */}
          <div style={{
            background: 'var(--bg-inset)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            padding: '10px 14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px'
          }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)', fontWeight: 700 }}>
                Webhook Verify Token
              </div>
              <div style={{ fontSize: '12px', fontFamily: 'monospace', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '2px' }}>
                {config.webhookVerifyToken || DEFAULT_VERIFY_TOKEN}
              </div>
            </div>
            <button
              type="button"
              className="adm-btn adm-btn--sm"
              onClick={() => copyToClipboard(config.webhookVerifyToken || DEFAULT_VERIFY_TOKEN, 'Verify Token')}
              style={{ padding: '6px 10px', fontSize: '11px', flexShrink: 0 }}
            >
              {copiedField === 'Verify Token' ? <Check size={13} style={{ color: '#10b981' }} /> : <Copy size={13} />}
              {copiedField === 'Verify Token' ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div style={{
        marginTop: '24px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        borderBottom: '1px solid var(--border)',
        paddingBottom: '10px',
        overflowX: 'auto'
      }}>
        {[
          { id: 'credentials', label: 'Meta API Credentials', icon: Key },
          { id: 'test', label: 'Send Live Test Message', icon: Send },
          { id: 'templates', label: 'Message Templates & Buttons', icon: Zap },
          { id: 'logs', label: 'Activity & Webhook Logs', icon: Activity }
        ].map(t => {
          const Icon = t.icon;
          const isActive = activeTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={`adm-btn ${isActive ? 'adm-btn--primary' : 'adm-btn--secondary'} adm-btn--sm`}
              style={{
                borderRadius: '20px',
                padding: '8px 16px',
                fontSize: '12.5px',
                fontWeight: isActive ? 800 : 600,
                display: 'flex',
                alignItems: 'center',
                gap: '7px',
                whiteSpace: 'nowrap'
              }}
            >
              <Icon size={14} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* TAB 1: Meta Credentials */}
      {activeTab === 'credentials' && (
        <section className="adm-panel" style={{ marginTop: '20px' }}>
          <header className="adm-panel-hd" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
              <span className="adm-icon-tile" style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6' }}>
                <Settings size={18} />
              </span>
              <div>
                <h2>Meta Cloud API Configuration</h2>
                <p className="adm-sub">API Credentials, Tokens &amp; Automated Alert Routing</p>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{
                fontSize: '11.5px',
                fontWeight: 700,
                padding: '4px 10px',
                borderRadius: '6px',
                background: config.enabled ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                color: config.enabled ? '#10b981' : '#ef4444',
                border: `1px solid ${config.enabled ? 'rgba(16, 185, 129, 0.25)' : 'rgba(239, 68, 68, 0.25)'}`
              }}>
                {config.enabled ? 'Service Active' : 'Service Paused'}
              </span>
            </div>
          </header>

          <form onSubmit={handleSaveConfig} className="adm-panel-bd adm-sec">
            {/* Master Toggle */}
            <div className="adm-toggle-row">
              <div className="adm-toggle-text">
                <div className="adm-toggle-name">Enable Automated WhatsApp Notifications</div>
                <div className="adm-toggle-hint">Master switch for automated dispatches (LR, Vouchers, Cashbook alerts)</div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={config.enabled}
                className="adm-switch"
                onClick={() => setConfig({ ...config, enabled: !config.enabled })}
              />
            </div>

            {/* Section 1: Meta API Credentials */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: '14px',
              marginTop: '4px'
            }}>
              {/* Phone Number ID */}
              <div className="adm-field">
                <label htmlFor="wa-phone-number-id">
                  Phone Number ID <span className="adm-req">*</span>
                </label>
                <input
                  id="wa-phone-number-id"
                  type="text"
                  className="adm-input"
                  placeholder="e.g. 1216388781567509"
                  value={config.phoneNumberId || ''}
                  onChange={e => setConfig({ ...config, phoneNumberId: e.target.value.trim() })}
                  required
                />
                <span className="adm-hint">Found in Meta Developer Portal &gt; WhatsApp &gt; API Setup.</span>
              </div>

              {/* WABA ID */}
              <div className="adm-field">
                <label htmlFor="wa-waba-id">
                  WhatsApp Business Account ID (WABA ID)
                </label>
                <input
                  id="wa-waba-id"
                  type="text"
                  className="adm-input"
                  placeholder="e.g. 923120010444696"
                  value={config.wabaId || ''}
                  onChange={e => setConfig({ ...config, wabaId: e.target.value.trim() })}
                />
                <span className="adm-hint">Found in Meta Developer Portal &gt; WhatsApp &gt; API Setup.</span>
              </div>
            </div>

            {/* Access Token with Clear, Paste & Show/Hide */}
            <div className="adm-field">
              <label htmlFor="wa-access-token" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Key size={13} /> Permanent System User Access Token <span className="adm-req">*</span>
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setConfig(c => ({ ...c, accessToken: '' }));
                      showToast('info', 'Access Token cleared');
                    }}
                    style={{
                      background: 'rgba(239, 68, 68, 0.1)',
                      color: '#ef4444',
                      border: '1px solid rgba(239, 68, 68, 0.25)',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '11px',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                    title="Clear Access Token"
                  >
                    <Trash2 size={11} /> Clear
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const text = await navigator.clipboard.readText();
                        if (text) {
                          const cleaned = text.trim().replace(/^Bearer\s+/i, '').replace(/^['"]|['"]$/g, '');
                          setConfig(c => ({ ...c, accessToken: cleaned }));
                          showToast('success', 'Clean token pasted from clipboard!');
                        }
                      } catch (err) {
                        showToast('error', 'Clipboard permission denied. Please paste manually into the field.');
                      }
                    }}
                    style={{
                      background: 'rgba(59, 130, 246, 0.1)',
                      color: '#3b82f6',
                      border: '1px solid rgba(59, 130, 246, 0.25)',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '11px',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                    title="Paste clean token from clipboard"
                  >
                    <Copy size={11} /> Paste
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowToken(!showToken)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--primary)',
                      cursor: 'pointer',
                      fontSize: '11px',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    {showToken ? <EyeOff size={13} /> : <Eye size={13} />}
                    {showToken ? 'Hide' : 'Show'}
                  </button>
                </div>
              </label>
              <input
                id="wa-access-token"
                name="meta_wa_api_token_custom_field"
                type="text"
                className="adm-input"
                placeholder="Paste clean token starting with EA..."
                value={config.accessToken || ''}
                onChange={e => {
                  let raw = e.target.value.trim().replace(/^Bearer\s+/i, '').replace(/^['"]|['"]$/g, '');
                  if (raw.includes('TMkrg6UtaDyzH4TT3qnx6njnhEDBqsq4Hn')) {
                    raw = raw.replace(/TMkrg6UtaDyzH4TT3qnx6njnhEDBqsq4Hn/g, '');
                  }
                  setConfig(c => ({ ...c, accessToken: raw }));
                }}
                autoComplete="one-time-code"
                style={{
                  WebkitTextSecurity: showToken ? 'none' : 'disc',
                  letterSpacing: showToken ? 'normal' : '2px'
                }}
                required
              />
              {Boolean(
                config.accessToken && (
                  config.accessToken.includes(' ') ||
                  /(.{20,})\1/.test(config.accessToken) ||
                  (config.accessToken.match(/EAA/g) || []).length > 1
                )
              ) && (
                <div style={{
                  marginTop: '8px',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  background: 'rgba(239, 68, 68, 0.12)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: '#ef4444',
                  fontSize: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <AlertTriangle size={15} style={{ flexShrink: 0 }} />
                  <span><b>Token Corrupted:</b> This token contains repeated/overlapping paste text. Click <b>Clear</b> above and paste your fresh token once.</span>
                </div>
              )}
            </div>

            {/* Webhook Verify Token */}
            <div className="adm-field">
              <label htmlFor="wa-verify-token">
                Webhook Verify Token
              </label>
              <input
                id="wa-verify-token"
                type="text"
                className="adm-input"
                placeholder="e.g. vgtc_meta_verify_token_2026"
                value={config.webhookVerifyToken || ''}
                onChange={e => setConfig({ ...config, webhookVerifyToken: e.target.value.trim() })}
              />
              <span className="adm-hint">
                Secret string configured in Meta App &gt; Webhook subscription verification.
              </span>
            </div>

            {/* Section 2: Alert Recipients */}
            <div style={{
              marginTop: '20px',
              paddingTop: '16px',
              borderTop: '1px solid var(--border)'
            }}>
              <div style={{ marginBottom: '12px' }}>
                <div style={{ fontSize: '13.5px', fontWeight: 800, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Phone size={14} style={{ color: 'var(--primary)' }} />
                  <span>System Alert Recipient Numbers</span>
                </div>
                <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '2px' }}>
                  Define which mobile numbers receive automated notifications for cashouts, advances, and loading status
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
                <div className="adm-field">
                  <label htmlFor="wa-admin-phones">
                    <Phone size={11} /> Admin Number(s)
                  </label>
                  <input
                    id="wa-admin-phones"
                    type="text"
                    className="adm-input"
                    placeholder="e.g. 8708032492, 9416319445"
                    value={config.adminPhonesStr || config.adminPhone || ''}
                    onChange={e => setConfig({ ...config, adminPhonesStr: e.target.value, adminPhone: e.target.value.split(',')[0]?.trim() || '' })}
                  />
                  <span className="adm-hint">Receives cashbook alerts, decline approvals &amp; low balance warnings.</span>
                </div>

                <div className="adm-field">
                  <label htmlFor="wa-clerk-phone">
                    <Users size={11} /> Clerk / Munshi Number
                  </label>
                  <input
                    id="wa-clerk-phone"
                    type="text"
                    className="adm-input"
                    placeholder="e.g. 8708032492"
                    value={config.clerkPhone || ''}
                    onChange={e => setConfig({ ...config, clerkPhone: e.target.value.trim() })}
                  />
                  <span className="adm-hint">Receives online advance voucher requests.</span>
                </div>

                <div className="adm-field">
                  <label htmlFor="wa-labour-phone">
                    <Layers size={11} /> Labour Team Number(s)
                  </label>
                  <input
                    id="wa-labour-phone"
                    type="text"
                    className="adm-input"
                    placeholder="e.g. 8708032492"
                    value={config.labourPhones || ''}
                    onChange={e => setConfig({ ...config, labourPhones: e.target.value.trim() })}
                  />
                  <span className="adm-hint">Receives loading queue alerts with [Mark Loaded] action button.</span>
                </div>
              </div>
            </div>

            <div style={{ marginTop: '20px' }}>
              <button type="submit" className="adm-btn adm-btn--primary" style={{ padding: '10px 24px', fontSize: '13px' }} disabled={saving}>
                {saving ? <Loader2 size={15} className="adm-spin" /> : <><Sparkles size={15} /> Save Meta API Settings</>}
              </button>
            </div>
          </form>
        </section>
      )}

      {/* TAB 2: Live Test Message Sender */}
      {activeTab === 'test' && (
        <section className="adm-panel" style={{ marginTop: '20px' }}>
          <header className="adm-panel-hd">
            <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
              <span className="adm-icon-tile" style={{ background: 'rgba(236, 72, 153, 0.1)', color: '#ec4899' }}>
                <Send size={18} />
              </span>
              <div>
                <h2>Dispatch Live Test WhatsApp Message</h2>
                <p className="adm-sub">Verify recipient phone delivery &amp; Meta Cloud API connectivity</p>
              </div>
            </div>
          </header>

          <form onSubmit={handleSendTestMsg} className="adm-panel-bd adm-sec" style={{ maxWidth: '680px' }}>
            <div className="adm-field">
              <label htmlFor="wa-test-phone">
                Recipient Mobile Number <span className="adm-req">*</span>
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ padding: '8px 12px', background: 'var(--bg-inset)', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '13px', fontWeight: 700 }}>
                  🇮🇳 +91
                </span>
                <input
                  id="wa-test-phone"
                  type="text"
                  className="adm-input"
                  placeholder="e.g. 8708032492 or 9876543210"
                  value={testForm.phone}
                  onChange={e => setTestForm({ ...testForm, phone: e.target.value })}
                  required
                  style={{ flex: 1 }}
                />
              </div>
              <span className="adm-hint">Enter the 10-digit mobile number to test delivery.</span>
            </div>

            <div className="adm-field">
              <label htmlFor="wa-test-msg">Custom Test Message Text (Optional)</label>
              <textarea
                id="wa-test-msg"
                className="adm-textarea"
                rows={3}
                placeholder="Leave blank for automatic test notification message..."
                value={testForm.message}
                onChange={e => setTestForm({ ...testForm, message: e.target.value })}
              />
            </div>

            <button
              type="submit"
              className="adm-btn adm-btn--primary adm-btn--block"
              disabled={testing || !config.phoneNumberId || !config.accessToken}
            >
              {testing ? <Loader2 size={15} className="adm-spin" /> : <><Send size={15} /> Send WhatsApp Message via Meta</>}
            </button>

            {testResult && (
              <div className={`adm-note ${testResult.success ? 'adm-note--success' : 'adm-note--danger'}`} style={{ marginTop: '16px' }}>
                <div>
                  <strong>{testResult.success ? '✅ WhatsApp Message Sent Successfully via Meta Cloud API' : '❌ Message Dispatch Failed'}</strong>
                  <div style={{ fontSize: '11px', fontFamily: 'monospace', marginTop: '4px', whiteSpace: 'pre-wrap' }}>
                    {testResult.success ? JSON.stringify(testResult.data?.result || 'OK', null, 2) : testResult.error}
                  </div>
                </div>
              </div>
            )}
          </form>
        </section>
      )}

      {/* TAB 3: Message Templates & Buttons */}
      {activeTab === 'templates' && (
        <section className="adm-panel" style={{ marginTop: '20px' }}>
          <header className="adm-panel-hd">
            <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
              <span className="adm-icon-tile" style={{ background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b' }}>
                <Zap size={18} />
              </span>
              <div>
                <h2>Automated Event Message Templates</h2>
                <p className="adm-sub">Customize WhatsApp text &amp; interactive button dispatches for every operational milestone</p>
              </div>
            </div>
            <button onClick={handleSaveConfig} className="adm-btn adm-btn--primary adm-btn--sm" disabled={saving}>
              {saving ? <Loader2 size={14} className="adm-spin" /> : <><Sparkles size={14} /> Save All Templates</>}
            </button>
          </header>

          <div className="adm-panel-bd adm-sec">
            {[
              {
                key: 'lr_created_owner',
                title: '1. LR Created — Owner Copy (Market Vehicles)',
                desc: 'Truck owner • Full loading receipt with freight rates, vehicle route, and materials breakdown',
                tags: '{lrNo} {truckNo} {date} {partyName} {destination} {source} {totalBags} {totalWeight} {materialsText}'
              },
              {
                key: 'lr_created_driver',
                title: '2. LR Created — Driver Loading Slip (All Vehicles)',
                desc: 'Truck driver • Daily Token turn slip advising driver to park at plant loading bay',
                tags: '{loadingNo} {lrNo} {truckNo} {date} {destination} {source} {materialsText} {totalWeight} {totalBags}'
              },
              {
                key: 'lr_loading_labour',
                title: '3. Labour Loading Queue Alert (With 1-Click Interactive Button)',
                desc: 'Labour team (8708032492) • Queue notice with native [✅ Mark as Loaded] button',
                tags: '{loadingNo} {lrNo} {truckNo} {source} {destination} {partyName} {loadingType} {materialsText} {totalWeight} {totalBags}'
              },
              {
                key: 'lr_loaded_creator',
                title: '4. Vehicle Loading Completed Confirmation',
                desc: 'System clerk / creator • Triggered automatically when labour marks vehicle loaded',
                tags: '{loadingNo} {lrNo} {truckNo} {source} {destination} {partyName}'
              },
              {
                key: 'voucher_created_owner',
                title: '5. Voucher Created — Owner Copy (Market Vehicles)',
                desc: 'Truck owner • Freight voucher with full breakdown (Diesel, Cash, Online advances, munshi, net due)',
                tags: '{voucherNo} {lrNo} {truckNo} {destination} {grossFreight} {netBalance} {advanceDiesel} {advanceCash} {advanceOnline} {munshi} {commission} {paymentStatus}'
              },
              {
                key: 'voucher_created_driver',
                title: '6. Voucher Created — Driver Copy / Dispatch Clearance',
                desc: 'Truck driver • Trip cleared authorization and safe travels notice',
                tags: '{voucherNo} {lrNo} {truckNo} {destination} {advanceDiesel} {advanceCash} {advanceOnline} {netBalance} {paymentStatus}'
              },
              {
                key: 'online_advance_clerk',
                title: '7. Online Advance Alert (With 1-Click [Mark as PAID] Button)',
                desc: 'Admin / clerk (8708032492) • Immediate alert with native 1-click button to mark payment complete',
                tags: '{voucherNo} {lrNo} {truckNo} {date} {advanceOnline} {driverName} {destination}'
              },
              {
                key: 'online_advance_pending_reminder',
                title: '8. Pending Online Advance Reminder (Daily 9:00 AM Cron)',
                desc: 'Admin / clerk • Reminds about unpaid online advances from previous days with [Mark as PAID] button',
                tags: '{voucherNo} {lrNo} {truckNo} {date} {advanceOnline} {driverName} {destination}'
              },
              {
                key: 'online_advance_paid_owner',
                title: '9. Online Advance Paid Confirmation — Owner Copy',
                desc: 'Truck owner • Dispatched immediately when clerk clicks [Mark as PAID]',
                tags: '{voucherNo} {lrNo} {truckNo} {advanceOnline} {paidDate}'
              },
              {
                key: 'online_advance_paid_driver',
                title: '10. Online Advance Paid Confirmation — Driver Copy',
                desc: 'Truck driver • Dispatched immediately when clerk clicks [Mark as PAID]',
                tags: '{voucherNo} {lrNo} {truckNo} {advanceOnline} {paidDate}'
              },
              {
                key: 'balance_paid',
                title: '11. Balance Payment Batch Dispatched',
                desc: 'Truck owner • Balance payment settlement notification',
                tags: '{truckNo} {tripCount} {periodFrom} {periodTo}'
              },
              {
                key: 'cashout',
                title: '12. Cashbook Cash Out Alert',
                desc: 'Admin (8708032492) • Financial withdrawal alert',
                tags: '{entityName} {entityType} {amount} {date} {remark}'
              },
              {
                key: 'deposit',
                title: '13. Cashbook Deposit Received Alert',
                desc: 'Admin (8708032492) • Financial deposit alert',
                tags: '{amount} {date} {remark}'
              }
            ].map(evt => {
              const evtConfig = config.events?.[evt.key] || { enabled: true, template: '' };
              const previewText = previews[evt.key];
              return (
                <div key={evt.key} className="adm-panel" style={{ background: 'var(--bg-th)', border: '1px solid var(--border)', marginBottom: '14px' }}>
                  <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text)' }}>{evt.title}</div>
                      <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '2px' }}>{evt.desc}</div>
                      <div style={{ fontSize: '10.5px', color: 'var(--text-sub)', fontFamily: 'monospace', marginTop: '4px' }}>
                        Available tags: <span style={{ color: 'var(--primary)', fontWeight: 700 }}>{evt.tags}</span>
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
                  <div style={{ padding: '14px 16px' }}>
                    <textarea
                      className="adm-textarea"
                      rows={4}
                      value={evtConfig.template || ''}
                      onChange={e => {
                        const updated = { ...config.events, [evt.key]: { ...evtConfig, template: e.target.value } };
                        setConfig({ ...config, events: updated });
                      }}
                      style={{ fontFamily: 'monospace', fontSize: '12px' }}
                    />
                    <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <button
                        type="button"
                        className="adm-btn adm-btn--sm"
                        onClick={() => handlePreviewTemplate(evt.key)}
                        disabled={previewingKey === evt.key}
                      >
                        {previewingKey === evt.key ? <Loader2 size={13} className="adm-spin" /> : <Eye size={13} />}
                        Preview Sample
                      </button>
                    </div>
                    {previewText && (
                      <div style={{
                        marginTop: '12px', background: 'var(--bg-inset)', border: '1px solid var(--border)',
                        borderRadius: 'var(--adm-r-sm)', padding: '14px 16px', fontSize: '12px',
                        fontFamily: 'monospace', whiteSpace: 'pre-wrap', color: 'var(--text)', lineHeight: 1.65
                      }}>
                        <div style={{ fontSize: '10.5px', fontWeight: 800, color: 'var(--primary)', marginBottom: '6px' }}>📱 WHATSAPP MESSAGE PREVIEW:</div>
                        {previewText}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* TAB 4: WhatsApp Activity & Webhook Logs */}
      {activeTab === 'logs' && (
        <section className="adm-panel" style={{ marginTop: '20px' }}>
          <header className="adm-panel-hd" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
              <span className="adm-icon-tile" style={{ background: 'rgba(99, 102, 241, 0.1)', color: '#6366f1' }}>
                <Activity size={18} />
              </span>
              <div>
                <h2>WhatsApp Activity &amp; Webhook Logs</h2>
                <p className="adm-sub">Live monitoring of outbound message deliveries and incoming Meta webhooks</p>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                type="button"
                className={`adm-btn adm-btn--sm ${autoRefreshLogs ? 'adm-btn--primary' : 'adm-btn--secondary'}`}
                onClick={() => setAutoRefreshLogs(!autoRefreshLogs)}
                title="Toggle 5-second automatic poll"
              >
                <Zap size={13} /> {autoRefreshLogs ? 'Auto-Live: ON' : 'Auto-Live: OFF'}
              </button>
              <button
                type="button"
                className="adm-btn adm-btn--secondary adm-btn--sm"
                onClick={fetchLogs}
                disabled={loadingLogs}
              >
                <RefreshCw size={13} className={loadingLogs ? 'adm-spin' : ''} /> Refresh
              </button>
              <button
                type="button"
                className="adm-btn adm-btn--sm"
                onClick={handleClearLogs}
                style={{ color: '#ef4444' }}
              >
                <Trash2 size={13} /> Clear
              </button>
            </div>
          </header>

          {/* Filter Pills */}
          <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', background: 'var(--bg-inset)' }}>
            {[
              { id: 'all', label: `All Logs (${logs.length})` },
              { id: 'outbound', label: `📤 Outbound Sent (${logs.filter(l => l.type === 'outbound' && l.status === 'sent').length})` },
              { id: 'inbound_webhook', label: `📥 Webhooks (${logs.filter(l => l.type === 'inbound_webhook').length})` },
              { id: 'failed', label: `❌ Failed (${logs.filter(l => l.status === 'failed').length})` },
            ].map(f => (
              <button
                key={f.id}
                type="button"
                onClick={() => setLogFilter(f.id)}
                style={{
                  background: logFilter === f.id ? 'var(--primary)' : 'var(--bg-th)',
                  color: logFilter === f.id ? '#ffffff' : 'var(--text)',
                  border: '1px solid var(--border)',
                  padding: '4px 12px',
                  borderRadius: '16px',
                  fontSize: '11.5px',
                  fontWeight: logFilter === f.id ? 800 : 600,
                  cursor: 'pointer'
                }}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Logs List Table */}
          <div className="adm-panel-bd" style={{ padding: 0 }}>
            {logs.length === 0 ? (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                <Activity size={32} style={{ opacity: 0.3, marginBottom: '8px' }} />
                <div>No WhatsApp activity logs recorded yet.</div>
                <div style={{ fontSize: '11.5px', marginTop: '4px' }}>Outbound dispatches and webhook actions will stream here live.</div>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="adm-table" style={{ width: '100%', fontSize: '12px' }}>
                  <thead>
                    <tr>
                      <th style={{ width: '120px' }}>Timestamp</th>
                      <th style={{ width: '100px' }}>Status</th>
                      <th style={{ width: '130px' }}>Type</th>
                      <th style={{ width: '140px' }}>Phone / Sender</th>
                      <th>Summary &amp; Payload Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs
                      .filter(l => {
                        if (logFilter === 'all') return true;
                        if (logFilter === 'failed') return l.status === 'failed';
                        if (logFilter === 'outbound') return l.type === 'outbound' && l.status === 'sent';
                        if (logFilter === 'inbound_webhook') return l.type === 'inbound_webhook';
                        return true;
                      })
                      .map(log => {
                        const isFailed = log.status === 'failed';
                        const isInbound = log.type === 'inbound_webhook';
                        const timeStr = log.timestamp ? new Date(log.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';
                        const dateStr = log.timestamp ? new Date(log.timestamp).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '';

                        return (
                          <tr key={log.id}>
                            <td style={{ whiteSpace: 'nowrap', color: 'var(--text-muted)', fontSize: '11px' }}>
                              <div>{dateStr}</div>
                              <div style={{ fontWeight: 700, color: 'var(--text)' }}>{timeStr}</div>
                            </td>
                            <td>
                              <span style={{
                                padding: '3px 8px',
                                borderRadius: '12px',
                                fontSize: '10.5px',
                                fontWeight: 800,
                                textTransform: 'uppercase',
                                background: isFailed ? 'rgba(239, 68, 68, 0.12)' : isInbound ? 'rgba(139, 92, 246, 0.12)' : 'rgba(16, 185, 129, 0.12)',
                                color: isFailed ? '#ef4444' : isInbound ? '#8b5cf6' : '#10b981',
                                border: `1px solid ${isFailed ? 'rgba(239, 68, 68, 0.3)' : isInbound ? 'rgba(139, 92, 246, 0.3)' : 'rgba(16, 185, 129, 0.3)'}`
                              }}>
                                {log.status}
                              </span>
                            </td>
                            <td style={{ fontWeight: 700, color: 'var(--text)' }}>
                              {log.category}
                            </td>
                            <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                              {log.phone || '—'}
                            </td>
                            <td>
                              <div style={{ fontWeight: 700, color: 'var(--text)' }}>{log.title}</div>
                              {log.details && (
                                <div style={{ fontSize: '11px', color: 'var(--text-sub)', marginTop: '2px', wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>
                                  {log.details}
                                </div>
                              )}
                              {log.error && (
                                <div style={{ fontSize: '11px', color: '#ef4444', marginTop: '3px', fontWeight: 600 }}>
                                  ⚠️ Error: {log.error}
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
