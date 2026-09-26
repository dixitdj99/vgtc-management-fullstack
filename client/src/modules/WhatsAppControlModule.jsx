import React, { useState, useEffect } from 'react';
import ax from '../api';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MessageSquare, Send, RefreshCw, CheckCircle2, AlertTriangle,
  Loader2, Sparkles, Zap, Eye, EyeOff, Phone, Key,
  Copy, Check, FileText, Search, UserCheck, Activity,
  Trash2, Globe, ShieldCheck, CheckCheck
} from 'lucide-react';
import TruckLoader from '../components/TruckLoader';
import '../pages/admin/admin.css';

const DEFAULT_PHONE_NUMBER_ID = '1216388781567509';
const DEFAULT_WABA_ID = '923120010444696';
const DEFAULT_ACCESS_TOKEN = 'EAAUUTeoUlMMBSYMeQWovzpVpJHEYRw1uZBRhTVbRDj3wVVA5mYZCAZBJvLTGKi2nS5T4tWawSwc8UZBrlI0L35CZAgwQZCag4GAkXmcm7Ftj1HoKLS9ZCl1tBJgUoqmO3UJN2juNMAfiF4zYlxAammX8SBFDVcS5JZCuU5PZAkv8oAM4zUMYfmhZB1jNZA9as9CcEZA21gZDZD';
const DEFAULT_VERIFY_TOKEN = 'vgtc_meta_verify_token_2026';
const DEFAULT_ADMIN_PHONES = '8708032492, 9416319445, 9728954901, 9728284849';
const DEFAULT_CLERK_PHONE = '8708032492';
const DEFAULT_LABOUR_PHONE = '8708032492';

const ALL_EVENT_DEFINITIONS = [
  // 1. Loading & Drivers
  {
    key: 'lr_created_owner',
    title: '1. Loading Receipt (LR) — Truck Owner Copy',
    category: 'Loading & Drivers',
    tags: ['{lrNo}', '{loadingNo}', '{date}', '{partyName}', '{truckNo}', '{source}', '{destination}', '{loadingType}', '{materialsText}', '{totalWeight}', '{totalBags}']
  },
  {
    key: 'lr_created_driver',
    title: '2. Driver Loading Slip / Turn Alert',
    category: 'Loading & Drivers',
    tags: ['{loadingNo}', '{lrNo}', '{truckNo}', '{date}', '{source}', '{destination}', '{materialsText}', '{totalWeight}', '{totalBags}']
  },
  {
    key: 'lr_loading_labour',
    title: '3. Labour Loading Queue Notification',
    category: 'Loading & Drivers',
    tags: ['{loadingNo}', '{lrNo}', '{truckNo}', '{source}', '{destination}', '{partyName}', '{loadingType}', '{materialsText}', '{totalWeight}', '{totalBags}']
  },
  {
    key: 'lr_loaded_creator',
    title: '4. Vehicle Loading Completed Alert',
    category: 'Loading & Drivers',
    tags: ['{loadingNo}', '{lrNo}', '{truckNo}', '{source}', '{destination}', '{partyName}']
  },

  // 2. Freight Vouchers
  {
    key: 'voucher_created_owner',
    title: '5. Freight Voucher — Truck Owner Copy',
    category: 'Freight Vouchers',
    tags: ['{voucherNo}', '{lrNo}', '{date}', '{truckNo}', '{destination}', '{grossFreight}', '{netBalance}', '{advanceDiesel}', '{advanceCash}', '{advanceOnline}', '{munshi}', '{commission}', '{paymentStatus}']
  },
  {
    key: 'voucher_created_driver',
    title: '6. Trip Cleared — Driver Copy',
    category: 'Freight Vouchers',
    tags: ['{voucherNo}', '{lrNo}', '{date}', '{truckNo}', '{destination}', '{advanceDiesel}', '{advanceCash}', '{advanceOnline}', '{netBalance}', '{paymentStatus}']
  },
  {
    key: 'voucher_action_creator',
    title: '7. Voucher Marked Paid Confirmation',
    category: 'Freight Vouchers',
    tags: ['{voucherNo}', '{truckNo}', '{lrNo}', '{advanceOnline}', '{paidDate}']
  },
  {
    key: 'balance_paid',
    title: '8. Balance Payment Dispatched',
    category: 'Freight Vouchers',
    tags: ['{truckNo}', '{tripCount}', '{periodFrom}', '{periodTo}']
  },

  // 3. Online Advances
  {
    key: 'online_advance_clerk',
    title: '9. Online Advance Action Alert (To Clerk)',
    category: 'Online Advances',
    tags: ['{voucherNo}', '{lrNo}', '{truckNo}', '{date}', '{advanceOnline}', '{driverName}', '{destination}']
  },
  {
    key: 'online_advance_pending_reminder',
    title: '10. Pending Online Advance Reminder (To Clerk)',
    category: 'Online Advances',
    tags: ['{voucherNo}', '{lrNo}', '{truckNo}', '{date}', '{advanceOnline}', '{driverName}', '{destination}']
  },
  {
    key: 'online_advance_paid_owner',
    title: '11. Online Advance Paid (To Owner)',
    category: 'Online Advances',
    tags: ['{voucherNo}', '{lrNo}', '{truckNo}', '{advanceOnline}', '{paidDate}']
  },
  {
    key: 'online_advance_paid_driver',
    title: '12. Online Advance Paid (To Driver)',
    category: 'Online Advances',
    tags: ['{voucherNo}', '{lrNo}', '{truckNo}', '{advanceOnline}', '{paidDate}']
  },

  // 4. Cashbook & Banking
  {
    key: 'deposit',
    title: '13. Cashbook Deposit Alert',
    category: 'Cashbook & Banking',
    tags: ['{amount}', '{date}', '{remark}']
  },
  {
    key: 'deposit_with_balance',
    title: '14. Deposit with Running Balance Alert',
    category: 'Cashbook & Banking',
    tags: ['{amount}', '{date}', '{remark}', '{prevBalance}', '{newBalance}']
  },
  {
    key: 'cashout',
    title: '15. Cashbook Cash Out Alert',
    category: 'Cashbook & Banking',
    tags: ['{entityName}', '{entityType}', '{amount}', '{date}', '{remark}']
  },
  {
    key: 'cashbook_low_balance',
    title: '16. Low Cashbook Balance Warning',
    category: 'Cashbook & Banking',
    tags: ['{currentBalance}']
  },

  // 5. Challan & Staff Khata
  {
    key: 'challan_created_owner',
    title: '17. Challan Issued — Truck Owner Copy',
    category: 'Challan & Staff Khata',
    tags: ['{challanNo}', '{date}', '{truckNo}', '{partyName}', '{destination}', '{materialsText}', '{totalWeight}', '{totalBags}']
  },
  {
    key: 'challan_linked_owner',
    title: '18. Challan Linked to LR Alert',
    category: 'Challan & Staff Khata',
    tags: ['{lrNo}', '{truckNo}', '{date}', '{challanNo}', '{materialsText}']
  },
  {
    key: 'challan_transferred_original_owner',
    title: '19. Challan Transfer Alert (Original Owner)',
    category: 'Challan & Staff Khata',
    tags: ['{challanNo}', '{materialsText}', '{originalTruck}', '{loadingTruck}', '{lrNo}', '{date}']
  },
  {
    key: 'staff_cashout_prompt',
    title: '20. Staff Advance / Cashout Confirmation',
    category: 'Challan & Staff Khata',
    tags: ['{staffName}', '{amount}', '{date}', '{remark}', '{totalAdvances}', '{remainingPay}']
  },
  {
    key: 'staff_cashout_disputed_admin',
    title: '21. Staff Cashout Dispute (Admin Alert)',
    category: 'Challan & Staff Khata',
    tags: ['{staffName}', '{entryId}', '{amount}', '{date}', '{remark}']
  },
  {
    key: 'staff_cashout_reversed_staff',
    title: '22. Staff Dispute Approved & Reverted',
    category: 'Challan & Staff Khata',
    tags: ['{staffName}', '{entryId}', '{amount}']
  },
  {
    key: 'staff_salary_settlement',
    title: '23. Staff Salary Settlement Voucher',
    category: 'Challan & Staff Khata',
    tags: ['{staffName}', '{staffType}', '{month}', '{vehicleLine}', '{daysInMonth}', '{presentDays}', '{absentDays}', '{deductedDays}', '{baseSalary}', '{attendanceDeductions}', '{allowanceLine}', '{penaltyLine}', '{adjustedSalary}', '{payoutAmount}', '{paymentMethod}', '{payoutDate}']
  }
];

const CATEGORIES = ['All', 'Loading & Drivers', 'Freight & Vouchers', 'Online Advances', 'Cashbook & Banking', 'Challan & Staff Khata'];

export default function WhatsAppControlModule() {
  const [activeTab, setActiveTab] = useState('templates'); // 'templates' | 'credentials' | 'logs'
  const [config, setConfig] = useState({
    enabled: false,
    provider: 'meta',
    phoneNumberId: DEFAULT_PHONE_NUMBER_ID,
    wabaId: DEFAULT_WABA_ID,
    accessToken: DEFAULT_ACCESS_TOKEN,
    webhookVerifyToken: DEFAULT_VERIFY_TOKEN,
    adminPhone: '8708032492',
    adminPhonesStr: DEFAULT_ADMIN_PHONES,
    clerkPhone: DEFAULT_CLERK_PHONE,
    labourPhones: DEFAULT_LABOUR_PHONE,
    payloadFormat: 'meta',
    events: {}
  });

  const [envInfo, setEnvInfo] = useState({
    env: 'local',
    envPrefix: 'dev_'
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

  // Template Management State
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [previews, setPreviews] = useState({});
  const [previewingKey, setPreviewingKey] = useState(null);

  // Test Dispatch Form
  const [testForm, setTestForm] = useState({
    phone: '8708032492',
    message: ''
  });
  const [testResult, setTestResult] = useState(null);

  // Logs State
  const [logs, setLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsFilter, setLogsFilter] = useState('all'); // 'all' | 'outbound' | 'inbound' | 'failed'

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
    fetchLogs();
  }, []);

  const fetchConfig = async () => {
    setLoading(true);
    try {
      const res = await ax.get('/whatsapp/config');
      if (res.data) {
        if (res.data.env) {
          setEnvInfo({ env: res.data.env, envPrefix: res.data.envPrefix || '' });
        }
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
          clerkPhone: res.data.clerkPhone || DEFAULT_CLERK_PHONE,
          labourPhones: res.data.labourPhones || DEFAULT_LABOUR_PHONE,
          events: { ...(res.data.events || {}) }
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
      if (res.data?.env) {
        setEnvInfo({ env: res.data.env, envPrefix: res.data.envPrefix || '' });
      }
      setStatus({
        checking: false,
        connected: res.data?.connected || false,
        message: res.data?.message || (res.data?.connected ? 'Meta Cloud API Online & Verified' : 'Setup Required'),
        verifiedName: res.data?.verifiedName || 'Vikas Goods Transport Co.',
        displayPhoneNumber: res.data?.displayPhoneNumber || config.phoneNumberId || DEFAULT_PHONE_NUMBER_ID
      });
    } catch (e) {
      setStatus({
        checking: false,
        connected: false,
        message: e.response?.data?.message || 'Meta Cloud API Unreachable',
        verifiedName: 'Vikas Goods Transport Co.',
        displayPhoneNumber: config.phoneNumberId || DEFAULT_PHONE_NUMBER_ID
      });
    }
  };

  const fetchLogs = async () => {
    setLogsLoading(true);
    try {
      const res = await ax.get('/whatsapp/logs?limit=100');
      if (res.data?.logs) {
        setLogs(res.data.logs);
      }
    } catch (e) {
      console.error('Failed to fetch logs:', e);
    } finally {
      setLogsLoading(false);
    }
  };

  const handleClearLogs = async () => {
    if (!window.confirm('Are you sure you want to clear all WhatsApp activity logs?')) return;
    try {
      await ax.delete('/whatsapp/logs');
      setLogs([]);
      showToast('success', 'WhatsApp activity logs cleared successfully');
    } catch (e) {
      showToast('error', 'Failed to clear logs: ' + e.message);
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
          : '🔴 WhatsApp Messages TURNED OFF (Muted — Safe Mode)'
      );
      fetchLogs();
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
        clerkPhone: (config.clerkPhone || DEFAULT_CLERK_PHONE).trim(),
        labourPhones: (config.labourPhones || DEFAULT_LABOUR_PHONE).trim(),
        payloadFormat: 'meta'
      };
      await ax.post('/whatsapp/config', payload);
      showToast('success', '✅ WhatsApp Configuration & Templates Saved Successfully!');
      checkConnection();
      fetchLogs();
    } catch (err) {
      showToast('error', err.response?.data?.error || 'Failed to save configuration');
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
      const res = await ax.post('/whatsapp/test', {
        phone: testForm.phone,
        message: testForm.message
      });
      setTestResult({ success: true, data: res.data });
      showToast('success', '✅ Test WhatsApp Message dispatched via Meta Cloud API!');
      checkConnection();
      fetchLogs();
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

  // Filter templates
  const filteredTemplates = ALL_EVENT_DEFINITIONS.filter(def => {
    const matchesCategory = selectedCategory === 'All' || def.category === selectedCategory;
    const matchesSearch = !searchQuery || def.title.toLowerCase().includes(searchQuery.toLowerCase()) || def.key.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  // Filter logs
  const filteredLogs = logs.filter(log => {
    if (logsFilter === 'outbound') return log.type === 'outbound';
    if (logsFilter === 'inbound') return log.type === 'inbound_webhook';
    if (logsFilter === 'failed') return log.status === 'failed';
    return true;
  });

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', width: '100%' }}>
        <TruckLoader size={120} text="Loading Meta WhatsApp Control Center..." />
      </div>
    );
  }

  const isLocalDev = envInfo.env === 'local' || envInfo.envPrefix === 'dev_';

  return (
    <div className="adm adm-page" style={{ paddingBottom: '60px' }}>
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
            Meta WhatsApp Control Center
          </h1>
          <p style={{ marginTop: '4px' }}>
            Production-grade Meta WhatsApp Cloud API automation for Loading Receipts, Vouchers, Advances &amp; Khata
          </p>
        </div>
        <div className="adm-head-actions" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            type="button"
            className="adm-btn adm-btn--sm"
            onClick={() => { checkConnection(); fetchLogs(); }}
            disabled={status.checking}
          >
            <RefreshCw size={13} className={status.checking ? 'adm-spin' : ''} />
            {status.checking ? 'Checking...' : 'Check Connection'}
          </button>
        </div>
      </div>

      {/* ── TOP METADATA & META SENDER STATUS BAR ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
        gap: '14px',
        marginBottom: '20px'
      }}>
        {/* Environment Tier Card */}
        <div style={{
          background: 'var(--bg-th)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          padding: '14px 18px',
          display: 'flex',
          alignItems: 'center',
          gap: '14px'
        }}>
          <div style={{
            background: isLocalDev ? 'rgba(245, 158, 11, 0.12)' : 'rgba(16, 185, 129, 0.12)',
            color: isLocalDev ? '#f59e0b' : '#10b981',
            borderRadius: '10px',
            padding: '10px',
            display: 'flex'
          }}>
            <Globe size={20} />
          </div>
          <div>
            <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', fontWeight: 700 }}>
              Active Environment
            </div>
            <div style={{ fontSize: '14px', fontWeight: 800, color: isLocalDev ? '#f59e0b' : '#10b981', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>{isLocalDev ? '⚡ LOCAL DEV' : '🟢 PRODUCTION'}</span>
              <span style={{ fontSize: '11px', background: 'var(--bg-inset)', padding: '2px 6px', borderRadius: '4px', color: 'var(--text-sub)' }}>
                {envInfo.envPrefix ? `[${envInfo.envPrefix}*]` : '[bare col]'}
              </span>
            </div>
          </div>
        </div>

        {/* Meta Registered Message Number */}
        <div style={{
          background: 'var(--bg-th)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          padding: '14px 18px',
          display: 'flex',
          alignItems: 'center',
          gap: '14px'
        }}>
          <div style={{
            background: 'rgba(37, 211, 102, 0.12)',
            color: '#25D366',
            borderRadius: '10px',
            padding: '10px',
            display: 'flex'
          }}>
            <Phone size={20} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', fontWeight: 700 }}>
              Meta Registered Sending Number
            </div>
            <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text)', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {status.displayPhoneNumber || config.phoneNumberId || '+91 99019 00002'}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              {status.verifiedName || 'Vikas Goods Transport Co.'}
            </div>
          </div>
        </div>

        {/* Meta Verification & Gate Status */}
        <div style={{
          background: 'var(--bg-th)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          padding: '14px 18px',
          display: 'flex',
          alignItems: 'center',
          gap: '14px'
        }}>
          <div style={{
            background: status.connected ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
            color: status.connected ? '#10b981' : '#ef4444',
            borderRadius: '10px',
            padding: '10px',
            display: 'flex'
          }}>
            <ShieldCheck size={20} />
          </div>
          <div>
            <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', fontWeight: 700 }}>
              Meta Cloud API Gateway
            </div>
            <div style={{ fontSize: '14px', fontWeight: 800, color: status.connected ? '#10b981' : '#ef4444', marginTop: '2px' }}>
              {status.connected ? 'Online & Authenticated' : 'Pending Verification'}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              WABA ID: {config.wabaId}
            </div>
          </div>
        </div>
      </div>

      {/* ── PROMINENT MASTER ON / OFF TOGGLE BANNER ── */}
      <div style={{
        marginBottom: '24px',
        borderRadius: '16px',
        padding: '20px 24px',
        background: config.enabled
          ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.14), rgba(16, 185, 129, 0.05))'
          : 'linear-gradient(135deg, rgba(239, 68, 68, 0.14), rgba(239, 68, 68, 0.04))',
        border: `2px solid ${config.enabled ? 'rgba(16, 185, 129, 0.45)' : 'rgba(239, 68, 68, 0.35)'}`,
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
              <span>WHATSAPP OUTBOUND MESSAGES:</span>
              <span style={{ textTransform: 'uppercase', textDecoration: 'underline' }}>
                {config.enabled ? 'LIVE (ACTIVE)' : 'MUTED (TURNED OFF)'}
              </span>
            </div>
            <div style={{ fontSize: '13px', color: 'var(--text-sub)', marginTop: '4px', lineHeight: 1.5 }}>
              {config.enabled
                ? 'Outbound notifications are LIVE. Messages will be dispatched to owners, drivers, clerk, and admin.'
                : 'Meta Business verification is currently in progress. Outbound notifications are muted so daily operations proceed without errors. Credentials and 22 templates remain ready to turn on anytime.'}
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
              padding: '10px 20px',
              fontSize: '13px',
              borderRadius: '8px',
              background: config.enabled ? '#ef4444' : '#10b981',
              color: '#ffffff',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: config.enabled ? '0 4px 12px rgba(239, 68, 68, 0.3)' : '0 4px 12px rgba(16, 185, 129, 0.3)'
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

      {/* ── TAB NAVIGATION BAR ── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        borderBottom: '1px solid var(--border)',
        marginBottom: '20px',
        paddingBottom: '2px',
        overflowX: 'auto'
      }}>
        <button
          type="button"
          onClick={() => setActiveTab('templates')}
          style={{
            padding: '10px 18px',
            fontSize: '13.5px',
            fontWeight: 700,
            borderRadius: '8px 8px 0 0',
            border: 'none',
            background: activeTab === 'templates' ? 'var(--bg-card)' : 'transparent',
            color: activeTab === 'templates' ? 'var(--primary)' : 'var(--text-sub)',
            borderBottom: activeTab === 'templates' ? '2.5px solid var(--primary)' : '2.5px solid transparent',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <FileText size={16} />
          <span>All Notification Templates ({ALL_EVENT_DEFINITIONS.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('credentials')}
          style={{
            padding: '10px 18px',
            fontSize: '13.5px',
            fontWeight: 700,
            borderRadius: '8px 8px 0 0',
            border: 'none',
            background: activeTab === 'credentials' ? 'var(--bg-card)' : 'transparent',
            color: activeTab === 'credentials' ? 'var(--primary)' : 'var(--text-sub)',
            borderBottom: activeTab === 'credentials' ? '2.5px solid var(--primary)' : '2.5px solid transparent',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <Key size={16} />
          <span>Credentials &amp; Routing Numbers</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('logs')}
          style={{
            padding: '10px 18px',
            fontSize: '13.5px',
            fontWeight: 700,
            borderRadius: '8px 8px 0 0',
            border: 'none',
            background: activeTab === 'logs' ? 'var(--bg-card)' : 'transparent',
            color: activeTab === 'logs' ? 'var(--primary)' : 'var(--text-sub)',
            borderBottom: activeTab === 'logs' ? '2.5px solid var(--primary)' : '2.5px solid transparent',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <Activity size={16} />
          <span>Live Activity &amp; Webhook Logs ({logs.length})</span>
        </button>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* ── TAB 1: ALL 22 NOTIFICATION TEMPLATES ─────────────────────────── */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'templates' && (
        <section className="adm-panel">
          <header className="adm-panel-hd" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
              <span className="adm-icon-tile" style={{ background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b' }}>
                <Zap size={18} />
              </span>
              <div>
                <h2>Operational Message Templates</h2>
                <p className="adm-sub">All 22 automated WhatsApp templates configured for logistics, billing &amp; advances</p>
              </div>
            </div>
            <button type="button" onClick={handleSaveConfig} className="adm-btn adm-btn--primary adm-btn--sm" disabled={saving}>
              {saving ? <Loader2 size={14} className="adm-spin" /> : <><Sparkles size={14} /> Save Templates</>}
            </button>
          </header>

          <div className="adm-panel-bd adm-sec" style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            {/* Filter & Search Bar */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
              {/* Category Pills */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                {CATEGORIES.map(cat => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedCategory(cat)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '20px',
                      fontSize: '12px',
                      fontWeight: 600,
                      border: '1px solid var(--border)',
                      background: selectedCategory === cat ? 'var(--primary)' : 'var(--bg-th)',
                      color: selectedCategory === cat ? '#ffffff' : 'var(--text-sub)',
                      cursor: 'pointer'
                    }}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              {/* Search Input */}
              <div style={{ position: 'relative', width: '260px' }}>
                <Search size={14} style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-muted)' }} />
                <input
                  type="text"
                  placeholder="Search templates or tags..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="adm-input"
                  style={{ paddingLeft: '32px', height: '34px', fontSize: '12px' }}
                />
              </div>
            </div>

            {/* Template List Cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {filteredTemplates.map(def => {
                const evtConfig = config.events?.[def.key] || { enabled: true, template: '' };
                const previewText = previews[def.key];
                return (
                  <div key={def.key} style={{ background: 'var(--bg-th)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
                    <div style={{
                      padding: '12px 18px',
                      background: 'var(--bg-card)',
                      borderBottom: '1px solid var(--border)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '12px'
                    }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '13.5px', fontWeight: 800, color: 'var(--text)' }}>{def.title}</span>
                          <span style={{ fontSize: '10px', background: 'var(--bg-inset)', padding: '2px 8px', borderRadius: '4px', color: 'var(--text-sub)', fontWeight: 600 }}>
                            {def.category}
                          </span>
                          <span style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--text-muted)' }}>
                            [{def.key}]
                          </span>
                        </div>
                        {/* Tags list */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap', marginTop: '6px' }}>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>Tags:</span>
                          {def.tags.map(t => (
                            <span
                              key={t}
                              title="Click to copy tag"
                              onClick={() => copyToClipboard(t, t)}
                              style={{
                                fontSize: '10.5px',
                                fontFamily: 'monospace',
                                background: 'rgba(59, 130, 246, 0.08)',
                                color: '#3b82f6',
                                padding: '1px 6px',
                                borderRadius: '4px',
                                cursor: 'pointer'
                              }}
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Enable / Disable Switch for specific event */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontSize: '12px', fontWeight: 600, color: evtConfig.enabled !== false ? '#10b981' : '#ef4444' }}>
                          {evtConfig.enabled !== false ? 'Enabled' : 'Disabled'}
                        </span>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={evtConfig.enabled !== false}
                          className="adm-switch"
                          onClick={() => {
                            const updated = { ...config.events, [def.key]: { ...evtConfig, enabled: evtConfig.enabled === false } };
                            setConfig({ ...config, events: updated });
                          }}
                        />
                      </div>
                    </div>

                    <div style={{ padding: '14px 18px' }}>
                      <textarea
                        className="adm-textarea"
                        rows={4}
                        placeholder={`Write custom WhatsApp template for ${def.title}...`}
                        value={evtConfig.template || ''}
                        onChange={e => {
                          const updated = { ...config.events, [def.key]: { ...evtConfig, template: e.target.value } };
                          setConfig({ ...config, events: updated });
                        }}
                        style={{ fontFamily: 'monospace', fontSize: '12px', lineHeight: 1.5 }}
                      />

                      <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                        <button
                          type="button"
                          className="adm-btn adm-btn--sm"
                          onClick={() => handlePreviewTemplate(def.key)}
                          disabled={previewingKey === def.key}
                          style={{ fontSize: '11px', padding: '5px 12px', display: 'flex', alignItems: 'center', gap: '6px' }}
                        >
                          {previewingKey === def.key ? <Loader2 size={12} className="adm-spin" /> : <Eye size={12} />}
                          Preview Sample
                        </button>
                      </div>

                      {previewText && (
                        <div style={{
                          marginTop: '12px',
                          background: '#075e54',
                          border: '1px solid #128c7e',
                          borderRadius: '10px',
                          padding: '14px 16px',
                          color: '#ffffff'
                        }}>
                          <div style={{ fontSize: '11px', fontWeight: 800, color: '#25D366', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <MessageSquare size={13} />
                            WHATSAPP MESSAGE PREVIEW:
                          </div>
                          <div style={{
                            background: '#dcf8c6',
                            color: '#111827',
                            padding: '12px 14px',
                            borderRadius: '8px',
                            fontSize: '12.5px',
                            fontFamily: 'monospace',
                            whiteSpace: 'pre-wrap',
                            lineHeight: 1.6,
                            boxShadow: '0 2px 5px rgba(0,0,0,0.2)'
                          }}>
                            {previewText}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Bottom Save Action */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '14px' }}>
              <button type="button" onClick={handleSaveConfig} className="adm-btn adm-btn--primary" disabled={saving}>
                {saving ? <Loader2 size={15} className="adm-spin" /> : <><Sparkles size={15} /> Save All Templates</>}
              </button>
            </div>
          </div>
        </section>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* ── TAB 2: CREDENTIALS & ROUTING NUMBERS ─────────────────────────── */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'credentials' && (
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

              {/* Webhook Verify Token */}
              <div className="adm-field">
                <label htmlFor="wa-verify-token">Webhook Verify Token</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    id="wa-verify-token"
                    type="text"
                    className="adm-input"
                    value={config.webhookVerifyToken || DEFAULT_VERIFY_TOKEN}
                    onChange={e => setConfig({ ...config, webhookVerifyToken: e.target.value })}
                    required
                  />
                  <button
                    type="button"
                    className="adm-btn adm-btn--secondary adm-btn--sm"
                    onClick={() => copyToClipboard(config.webhookVerifyToken || DEFAULT_VERIFY_TOKEN, 'Webhook Token')}
                  >
                    {copiedField === 'Webhook Token' ? <Check size={14} style={{ color: '#10b981' }} /> : <Copy size={14} />}
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

              {/* Clerk WhatsApp Number */}
              <div className="adm-field">
                <label htmlFor="wa-clerk">Clerk WhatsApp Number</label>
                <input
                  id="wa-clerk"
                  type="text"
                  className="adm-input"
                  placeholder="e.g. 8708032492"
                  value={config.clerkPhone || ''}
                  onChange={e => setConfig({ ...config, clerkPhone: e.target.value })}
                />
                <span className="adm-hint">Online advance alerts &amp; pending advance reminders are routed directly to this clerk number.</span>
              </div>

              {/* Labour Dispatch WhatsApp Numbers */}
              <div className="adm-field">
                <label htmlFor="wa-labour">Labour Dispatch Alert Numbers</label>
                <input
                  id="wa-labour"
                  type="text"
                  className="adm-input"
                  placeholder="e.g. 8708032492"
                  value={config.labourPhones || ''}
                  onChange={e => setConfig({ ...config, labourPhones: e.target.value })}
                />
                <span className="adm-hint">Loading queue tokens and arrival alerts are sent to the labour team.</span>
              </div>

              <button type="submit" className="adm-btn adm-btn--primary adm-btn--block" disabled={saving}>
                {saving ? <Loader2 size={15} className="adm-spin" /> : <><Sparkles size={15} /> Save Credentials &amp; Numbers</>}
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
                  <p className="adm-sub">Direct delivery verification via Meta Cloud API</p>
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
                <label htmlFor="wa-test-msg">Custom Test Message (Optional)</label>
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
                      {testResult.success ? 'Dispatched via Meta WhatsApp Cloud API' : testResult.error}
                    </div>
                  </div>
                </div>
              )}
            </form>
          </section>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* ── TAB 3: LIVE ACTIVITY & WEBHOOK LOGS ──────────────────────────── */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'logs' && (
        <section className="adm-panel">
          <header className="adm-panel-hd" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
              <span className="adm-icon-tile" style={{ background: 'rgba(99, 102, 241, 0.1)', color: '#6366f1' }}>
                <Activity size={18} />
              </span>
              <div>
                <h2>WhatsApp Activity &amp; Webhook Logs</h2>
                <p className="adm-sub">Live audit trail of outbound alerts and incoming webhooks</p>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <button
                type="button"
                className="adm-btn adm-btn--secondary adm-btn--sm"
                onClick={fetchLogs}
                disabled={logsLoading}
              >
                <RefreshCw size={13} className={logsLoading ? 'adm-spin' : ''} />
                {logsLoading ? 'Refreshing...' : 'Refresh Logs'}
              </button>
              <button
                type="button"
                className="adm-btn adm-btn--danger adm-btn--sm"
                onClick={handleClearLogs}
                disabled={logs.length === 0}
              >
                <Trash2 size={13} />
                Clear Logs
              </button>
            </div>
          </header>

          <div className="adm-panel-bd adm-sec" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {/* Filter Pills */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              {[
                { id: 'all', label: `All Logs (${logs.length})` },
                { id: 'outbound', label: 'Outbound Dispatches' },
                { id: 'inbound', label: 'Inbound Webhooks' },
                { id: 'failed', label: 'Failed' }
              ].map(f => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setLogsFilter(f.id)}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '20px',
                    fontSize: '12px',
                    fontWeight: 600,
                    border: '1px solid var(--border)',
                    background: logsFilter === f.id ? 'var(--primary)' : 'var(--bg-th)',
                    color: logsFilter === f.id ? '#ffffff' : 'var(--text-sub)',
                    cursor: 'pointer'
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Logs Table */}
            {filteredLogs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
                <Activity size={32} style={{ opacity: 0.4, marginBottom: '10px' }} />
                <div style={{ fontSize: '14px', fontWeight: 600 }}>No WhatsApp Activity Logs Found</div>
                <div style={{ fontSize: '12px', marginTop: '4px' }}>
                  Logs will automatically populate when test messages, loading receipts, or vouchers are created.
                </div>
              </div>
            ) : (
              <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: '10px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-th)', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                      <th style={{ padding: '10px 14px', color: 'var(--text-muted)', fontWeight: 700 }}>TIMESTAMP</th>
                      <th style={{ padding: '10px 14px', color: 'var(--text-muted)', fontWeight: 700 }}>TYPE</th>
                      <th style={{ padding: '10px 14px', color: 'var(--text-muted)', fontWeight: 700 }}>RECIPIENT / PHONE</th>
                      <th style={{ padding: '10px 14px', color: 'var(--text-muted)', fontWeight: 700 }}>EVENT / TITLE</th>
                      <th style={{ padding: '10px 14px', color: 'var(--text-muted)', fontWeight: 700 }}>STATUS</th>
                      <th style={{ padding: '10px 14px', color: 'var(--text-muted)', fontWeight: 700 }}>DETAILS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLogs.map(log => {
                      const dateStr = log.timestamp ? new Date(log.timestamp).toLocaleString('en-IN') : 'Just now';
                      const isFailed = log.status === 'failed' || !!log.error;
                      return (
                        <tr key={log.id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '10px 14px', whiteSpace: 'nowrap', color: 'var(--text-sub)' }}>
                            {dateStr}
                          </td>
                          <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                            <span style={{
                              padding: '2px 8px',
                              borderRadius: '4px',
                              fontSize: '11px',
                              fontWeight: 700,
                              background: log.type === 'inbound_webhook' ? 'rgba(99, 102, 241, 0.12)' : 'rgba(16, 185, 129, 0.12)',
                              color: log.type === 'inbound_webhook' ? '#6366f1' : '#10b981'
                            }}>
                              {log.type === 'inbound_webhook' ? 'WEBHOOK' : 'OUTBOUND'}
                            </span>
                          </td>
                          <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontWeight: 600, color: 'var(--text)' }}>
                            {log.phone || '-'}
                          </td>
                          <td style={{ padding: '10px 14px', color: 'var(--text)', fontWeight: 600 }}>
                            {log.title || log.category}
                          </td>
                          <td style={{ padding: '10px 14px' }}>
                            <span style={{
                              padding: '2px 8px',
                              borderRadius: '4px',
                              fontSize: '11px',
                              fontWeight: 700,
                              background: isFailed ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                              color: isFailed ? '#ef4444' : '#10b981'
                            }}>
                              {isFailed ? 'FAILED' : 'SENT'}
                            </span>
                          </td>
                          <td style={{ padding: '10px 14px', color: isFailed ? '#ef4444' : 'var(--text-sub)', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {log.error || log.details || '-'}
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
