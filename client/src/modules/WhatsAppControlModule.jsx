import React, { useState, useEffect } from 'react';
import ax from '../api';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MessageSquare, Send, RefreshCw, CheckCircle2, AlertTriangle,
  Loader2, Sparkles, Zap, Eye, EyeOff, Phone, Key,
  Copy, Check, FileText, Search, UserCheck, Activity,
  Trash2, Globe, ShieldCheck, CheckCheck, Truck, Receipt,
  CreditCard, Landmark, Users, RotateCcw, ChevronDown, ChevronUp
} from 'lucide-react';
import TruckLoader from '../components/TruckLoader';
import '../pages/admin/admin.css';

const DEFAULT_PHONE_NUMBER_ID = '1216388781567509';
const DEFAULT_WABA_ID = '1552863822720100';
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

const CATEGORIES = ['All', 'Loading & Drivers', 'Freight Vouchers', 'Online Advances', 'Cashbook & Banking', 'Challan & Staff Khata'];

const getCategoryIcon = (category) => {
  switch (category) {
    case 'Loading & Drivers':
      return <Truck size={17} />;
    case 'Freight Vouchers':
    case 'Freight & Vouchers':
      return <Receipt size={17} />;
    case 'Online Advances':
      return <CreditCard size={17} />;
    case 'Cashbook & Banking':
      return <Landmark size={17} />;
    case 'Challan & Staff Khata':
      return <Users size={17} />;
    default:
      return <MessageSquare size={17} />;
  }
};

const getCategoryColor = (category) => {
  switch (category) {
    case 'Loading & Drivers':
      return { bg: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', border: 'rgba(59, 130, 246, 0.25)', accent: '#3b82f6' };
    case 'Freight Vouchers':
    case 'Freight & Vouchers':
      return { bg: 'rgba(16, 185, 129, 0.1)', color: '#10b981', border: 'rgba(16, 185, 129, 0.25)', accent: '#10b981' };
    case 'Online Advances':
      return { bg: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b', border: 'rgba(245, 158, 11, 0.25)', accent: '#f59e0b' };
    case 'Cashbook & Banking':
      return { bg: 'rgba(139, 92, 246, 0.1)', color: '#8b5cf6', border: 'rgba(139, 92, 246, 0.25)', accent: '#8b5cf6' };
    case 'Challan & Staff Khata':
      return { bg: 'rgba(236, 72, 153, 0.1)', color: '#ec4899', border: 'rgba(236, 72, 153, 0.25)', accent: '#ec4899' };
    default:
      return { bg: 'rgba(99, 102, 241, 0.1)', color: '#6366f1', border: 'rgba(99, 102, 241, 0.25)', accent: '#6366f1' };
  }
};

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

  const [loading, setLoading] = useState(true);
  const [configLoadError, setConfigLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [copiedField, setCopiedField] = useState(null);

  const [status, setStatus] = useState({
    checking: true,
    connected: false,
    reason: '',
    message: '',
    verifiedName: '',
    displayPhoneNumber: '',
    connectionScope: '',
    accountMode: '',
    phoneStatus: '',
    qualityRating: '',
    codeVerificationStatus: ''
  });

  // Template Management State
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [previews, setPreviews] = useState({});
  const [previewingKey, setPreviewingKey] = useState(null);
  const [expandedTags, setExpandedTags] = useState({});

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
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') checkConnection();
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  const fetchConfig = async (refreshStatus = true) => {
    setLoading(true);
    setConfigLoadError('');
    let loaded = false;
    try {
      const res = await ax.get('/whatsapp/config', { _skipCache: true });
      if (!res.data || typeof res.data !== 'object') throw new Error('Invalid WhatsApp configuration response');
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
          clerkPhone: res.data.clerkPhone || DEFAULT_CLERK_PHONE,
          labourPhones: res.data.labourPhones || DEFAULT_LABOUR_PHONE,
          events: { ...(res.data.events || {}) }
        }));
      }
      loaded = true;
      return true;
    } catch (e) {
      console.error('Failed to fetch WhatsApp config', e);
      setConfigLoadError('Could not load saved WhatsApp settings. Retry before making changes.');
      return false;
    } finally {
      setLoading(false);
      if (loaded && refreshStatus) checkConnection();
    }
  };

  const checkConnection = async () => {
    setStatus(prev => ({ ...prev, checking: true, message: 'Validating Meta Cloud API credentials...' }));
    try {
      const res = await ax.get('/whatsapp/status', { _skipCache: true });
      setStatus({
        checking: false,
        connected: res.data?.connected || false,
        reason: res.data?.reason || '',
        message: res.data?.message || (res.data?.connected ? 'Meta Cloud API Connected' : 'Setup Required'),
        verifiedName: res.data?.verifiedName || '',
        displayPhoneNumber: res.data?.displayPhoneNumber || '',
        connectionScope: res.data?.connectionScope || '',
        accountMode: res.data?.accountMode || '',
        phoneStatus: res.data?.phoneStatus || '',
        qualityRating: res.data?.qualityRating || '',
        codeVerificationStatus: res.data?.codeVerificationStatus || ''
      });
      return res.data;
    } catch (e) {
      setStatus({
        checking: false,
        connected: false,
        reason: 'unreachable',
        message: e.response?.data?.message || 'Meta Cloud API Unreachable',
        verifiedName: '',
        displayPhoneNumber: '',
        connectionScope: '',
        accountMode: '',
        phoneStatus: '',
        qualityRating: '',
        codeVerificationStatus: ''
      });
      return { connected: false, reason: 'unreachable' };
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
      const res = await ax.post('/whatsapp/toggle', { enabled: nextState });
      if (!res.data?.ok) throw new Error('WhatsApp toggle was not saved');
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
        accessToken: (() => {
          let t = (config.accessToken || DEFAULT_ACCESS_TOKEN).trim().replace(/\s+/g, '');
          if (t.length > 100 && t.length % 2 === 0 && t.slice(0, t.length / 2) === t.slice(t.length / 2)) {
            t = t.slice(0, t.length / 2);
          }
          return t;
        })(),
        webhookVerifyToken: (config.webhookVerifyToken || DEFAULT_VERIFY_TOKEN).trim(),
        adminPhone: adminPhonesArr[0] || '8708032492',
        adminPhones: adminPhonesArr,
        clerkPhone: (config.clerkPhone || DEFAULT_CLERK_PHONE).trim(),
        labourPhones: (config.labourPhones || DEFAULT_LABOUR_PHONE).trim(),
        payloadFormat: 'meta'
      };
      const saved = await ax.post('/whatsapp/config', payload);
      if (!saved.data?.ok) throw new Error('WhatsApp settings were not saved');
      if (!await fetchConfig(false)) throw new Error('Saved settings could not be reloaded');
      const metaStatus = await checkConnection();
      showToast(metaStatus?.connected ? 'success' : 'info', metaStatus?.connected
        ? 'WhatsApp settings saved. Meta connected.'
        : metaStatus?.reason === 'invalid_token'
          ? 'Settings saved, but Meta rejected the access token.'
          : 'WhatsApp settings saved. Meta connection needs attention.');
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

  const handleTogglePreview = async (eventKey) => {
    if (previews[eventKey]) {
      setPreviews(p => {
        const next = { ...p };
        delete next[eventKey];
        return next;
      });
      return;
    }
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
    const matchesCategory = selectedCategory === 'All' || def.category === selectedCategory || (selectedCategory === 'Freight Vouchers' && def.category === 'Freight Vouchers');
    const matchesSearch = !searchQuery ||
      def.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      def.key.toLowerCase().includes(searchQuery.toLowerCase()) ||
      def.tags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()));
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

  if (configLoadError) {
    return (
      <div className="adm adm-page" style={{ paddingTop: '32px' }}>
        <div className="adm-card" style={{ padding: '24px', maxWidth: '520px' }}>
          <h2 style={{ marginTop: 0 }}>WhatsApp settings unavailable</h2>
          <p>{configLoadError}</p>
          <button type="button" className="adm-btn adm-btn--sm" onClick={fetchConfig}>Retry loading</button>
        </div>
      </div>
    );
  }

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

      {/* Live Meta summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px', marginBottom: '14px' }}>
        <div style={{ background: 'var(--bg-th)', border: '1px solid var(--border)', borderRadius: '10px', padding: '10px 12px', display: 'flex', alignItems: 'center', gap: '10px', minHeight: '70px' }}>
          <Globe size={17} style={{ color: status.connected ? '#10b981' : 'var(--text-muted)', flexShrink: 0 }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 700 }}>META ENVIRONMENT</div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>
              {status.checking ? 'Checking…' : status.connected ? 'Connected' : 'Not connected'}
            </div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
              {status.accountMode ? `Mode: ${status.accountMode}` : status.reason === 'invalid_token' ? 'Token rejected' : 'Mode unavailable'}
            </div>
          </div>
        </div>

        <div style={{ background: 'var(--bg-th)', border: '1px solid var(--border)', borderRadius: '10px', padding: '10px 12px', display: 'flex', alignItems: 'center', gap: '10px', minHeight: '70px' }}>
          <Phone size={17} style={{ color: status.displayPhoneNumber ? '#25D366' : 'var(--text-muted)', flexShrink: 0 }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 700 }}>META SENDING NUMBER</div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {status.displayPhoneNumber || 'Unavailable'}
            </div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {status.verifiedName || 'Shown after Meta confirms number'}
            </div>
          </div>
        </div>

        <div style={{ background: 'var(--bg-th)', border: '1px solid var(--border)', borderRadius: '10px', padding: '10px 12px', display: 'flex', alignItems: 'center', gap: '10px', minHeight: '70px' }}>
          <ShieldCheck size={17} style={{ color: status.connected ? '#10b981' : 'var(--text-muted)', flexShrink: 0 }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 700 }}>META CLOUD API</div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: status.reason === 'invalid_token' ? '#f59e0b' : 'var(--text)' }}>
              {status.checking ? 'Checking…' : status.reason === 'invalid_token' ? 'Token rejected' : status.connected ? 'Connected' : 'Not connected'}
            </div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={status.message}>
              {status.reason === 'invalid_token' ? 'Replace token in Credentials' : status.reason === 'missing_credentials' ? 'Add token and Phone Number ID' : status.connected ? 'Meta API reachable' : 'Check credentials'}
            </div>
          </div>
        </div>
      </div>

      {/* Outbound message setting */}
      <div style={{
        marginBottom: '20px',
        borderRadius: '10px',
        padding: '11px 14px',
        background: 'var(--bg-th)',
        border: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '10px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
          <div style={{ color: config.enabled ? '#10b981' : 'var(--text-muted)', display: 'flex' }}>
            {config.enabled ? <CheckCircle2 size={17} /> : <MessageSquare size={17} />}
          </div>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>
              Outbound WhatsApp messages <span style={{ color: config.enabled ? '#10b981' : 'var(--text-muted)' }}>· {config.enabled ? 'On' : 'Off'}</span>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
              {config.enabled
                ? 'Automatic notifications enabled.'
                : 'Automatic notifications paused.'}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {toggling && <Loader2 size={14} className="adm-spin" />}
          <button
            type="button"
            role="switch"
            aria-checked={config.enabled}
            aria-label="Outbound WhatsApp messages"
            disabled={toggling}
            className="adm-switch"
            onClick={() => handleToggle()}
            title={config.enabled ? 'Pause outbound messages' : 'Enable outbound messages'}
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
              <span className="adm-icon-tile" style={{ background: 'rgba(37, 211, 102, 0.12)', color: '#25D366' }}>
                <Zap size={19} />
              </span>
              <div>
                <h2>Operational Message Templates</h2>
                <p className="adm-sub">All {ALL_EVENT_DEFINITIONS.length} automated WhatsApp templates configured for logistics, billing &amp; advances</p>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <button
                type="button"
                onClick={() => {
                  if (Object.keys(previews).length > 0) {
                    setPreviews({});
                  } else {
                    const samplePreviews = {};
                    filteredTemplates.slice(0, 4).forEach(def => {
                      handleTogglePreview(def.key);
                    });
                  }
                }}
                className="adm-btn adm-btn--sm"
                title="Toggle sample previews"
                style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Eye size={13} />
                <span>{Object.keys(previews).length > 0 ? 'Collapse Previews' : 'Preview Samples'}</span>
              </button>

              <button type="button" onClick={handleSaveConfig} className="adm-btn adm-btn--primary adm-btn--sm" disabled={saving}>
                {saving ? <Loader2 size={14} className="adm-spin" /> : <><Sparkles size={14} /> Save Templates</>}
              </button>
            </div>
          </header>

          <div className="adm-panel-bd adm-sec" style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            {/* Filter & Search Bar */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
              {/* Category Pills with counts */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                {CATEGORIES.map(cat => {
                  const count = cat === 'All'
                    ? ALL_EVENT_DEFINITIONS.length
                    : ALL_EVENT_DEFINITIONS.filter(d => d.category === cat).length;
                  const isSelected = selectedCategory === cat;
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setSelectedCategory(cat)}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '20px',
                        fontSize: '12px',
                        fontWeight: 700,
                        border: isSelected ? '1px solid var(--primary)' : '1px solid var(--border)',
                        background: isSelected ? 'var(--primary)' : 'var(--bg-th)',
                        color: isSelected ? '#ffffff' : 'var(--text-sub)',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <span>{cat}</span>
                      <span style={{
                        fontSize: '10px',
                        padding: '1px 6px',
                        borderRadius: '999px',
                        background: isSelected ? 'rgba(255,255,255,0.25)' : 'var(--bg-card)',
                        color: isSelected ? '#ffffff' : 'var(--text-muted)'
                      }}>
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Search Input with quick clear */}
              <div style={{ position: 'relative', width: '280px' }}>
                <Search size={14} style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-muted)' }} />
                <input
                  type="text"
                  placeholder="Search templates or variables..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="adm-input"
                  style={{ paddingLeft: '32px', paddingRight: searchQuery ? '30px' : '12px', height: '34px', fontSize: '12px' }}
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    style={{
                      position: 'absolute',
                      right: '8px',
                      top: '8px',
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                      fontSize: '12px',
                      padding: 0
                    }}
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            {/* Template Status Summary Bar */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '10px',
              padding: '8px 14px',
              background: 'var(--bg-th)',
              borderRadius: '9px',
              border: '1px solid var(--border)',
              fontSize: '12px',
              color: 'var(--text-muted)'
            }}>
              <div>
                Showing <strong style={{ color: 'var(--text)' }}>{filteredTemplates.length}</strong> of {ALL_EVENT_DEFINITIONS.length} templates
                {selectedCategory !== 'All' && <span> in <strong style={{ color: 'var(--text)' }}>{selectedCategory}</strong></span>}
                {searchQuery && <span> matching "<em>{searchQuery}</em>"</span>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981' }} />
                  {ALL_EVENT_DEFINITIONS.filter(d => (config.events?.[d.key]?.enabled !== false)).length} Enabled
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#94a3b8' }} />
                  {ALL_EVENT_DEFINITIONS.filter(d => (config.events?.[d.key]?.enabled === false)).length} Paused
                </span>
              </div>
            </div>

            {/* ── TEMPLATES CARDS GRID ── */}
            {filteredTemplates.length === 0 ? (
              <div style={{
                padding: '40px 20px',
                textAlign: 'center',
                background: 'var(--bg-th)',
                borderRadius: '12px',
                border: '1px dashed var(--border)'
              }}>
                <MessageSquare size={32} style={{ color: 'var(--text-muted)', opacity: 0.5, marginBottom: '8px' }} />
                <h4 style={{ margin: '0 0 6px', color: 'var(--text)' }}>No templates found</h4>
                <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-muted)' }}>
                  No notification templates match your search criteria.
                </p>
                <button
                  type="button"
                  onClick={() => { setSelectedCategory('All'); setSearchQuery(''); }}
                  className="adm-btn adm-btn--sm"
                  style={{ marginTop: '12px' }}
                >
                  Reset filters
                </button>
              </div>
            ) : (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
                gap: '16px',
                alignItems: 'stretch'
              }}>
                {filteredTemplates.map(def => {
                  const evtConfig = config.events?.[def.key] || { enabled: true, template: '' };
                  const isEnabled = evtConfig.enabled !== false;
                  const previewText = previews[def.key];
                  const catColors = getCategoryColor(def.category);
                  const isTagsExpanded = !!expandedTags[def.key];
                  const visibleTags = isTagsExpanded ? def.tags : def.tags.slice(0, 6);
                  const hasMoreTags = def.tags.length > 6;

                  return (
                    <div
                      key={def.key}
                      style={{
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border)',
                        borderTop: `3px solid ${isEnabled ? catColors.accent : 'var(--border)'}`,
                        borderRadius: '14px',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'hidden',
                        transition: 'transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease',
                        opacity: isEnabled ? 1 : 0.82
                      }}
                    >
                      {/* Card Header */}
                      <div style={{
                        padding: '13px 15px',
                        background: 'var(--bg-th)',
                        borderBottom: '1px solid var(--border)',
                        display: 'flex',
                        alignItems: 'flex-start',
                        justifyContent: 'space-between',
                        gap: '10px'
                      }}>
                        <div style={{ display: 'flex', gap: '10px', minWidth: 0, flex: 1 }}>
                          <div style={{
                            width: '36px',
                            height: '36px',
                            borderRadius: '9px',
                            background: catColors.bg,
                            color: catColors.color,
                            border: `1px solid ${catColors.border}`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0
                          }}>
                            {getCategoryIcon(def.category)}
                          </div>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap', marginBottom: '3px' }}>
                              <span style={{
                                fontSize: '10px',
                                fontWeight: 700,
                                background: catColors.bg,
                                color: catColors.color,
                                padding: '1px 6px',
                                borderRadius: '4px',
                                border: `1px solid ${catColors.border}`
                              }}>
                                {def.category}
                              </span>
                              <button
                                type="button"
                                onClick={() => copyToClipboard(def.key, `Key ${def.key}`)}
                                title="Click to copy event key"
                                style={{
                                  fontSize: '10px',
                                  fontFamily: 'monospace',
                                  color: 'var(--text-muted)',
                                  background: 'var(--bg-card)',
                                  border: '1px solid var(--border)',
                                  padding: '1px 5px',
                                  borderRadius: '4px',
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '3px'
                                }}
                              >
                                <span>{def.key}</span>
                                {copiedField === `Key ${def.key}` ? <Check size={9} color="#10b981" /> : <Copy size={9} />}
                              </button>
                            </div>
                            <h3 style={{
                              margin: 0,
                              fontSize: '13.5px',
                              fontWeight: 800,
                              color: 'var(--text)',
                              lineHeight: 1.35
                            }}>
                              {def.title}
                            </h3>
                          </div>
                        </div>

                        {/* Switch + Status Badge */}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '5px', flexShrink: 0 }}>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={isEnabled}
                            className="adm-switch"
                            onClick={() => {
                              const updated = { ...config.events, [def.key]: { ...evtConfig, enabled: !isEnabled } };
                              setConfig({ ...config, events: updated });
                            }}
                            title={isEnabled ? 'Click to disable' : 'Click to enable'}
                          />
                          <span style={{
                            fontSize: '9.5px',
                            fontWeight: 800,
                            padding: '1px 5px',
                            borderRadius: '4px',
                            background: isEnabled ? 'rgba(16, 185, 129, 0.12)' : 'var(--bg-card)',
                            color: isEnabled ? '#10b981' : 'var(--text-muted)',
                            border: `1px solid ${isEnabled ? 'rgba(16, 185, 129, 0.25)' : 'var(--border)'}`,
                            textTransform: 'uppercase',
                            letterSpacing: '0.04em'
                          }}>
                            {isEnabled ? 'Active' : 'Paused'}
                          </span>
                        </div>
                      </div>

                      {/* Card Body */}
                      <div style={{ padding: '14px 15px', display: 'flex', flexDirection: 'column', gap: '12px', flex: 1 }}>
                        {/* Variables / Tags Cloud */}
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                            <span style={{ fontSize: '10.5px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                              Variables ({def.tags.length})
                            </span>
                            <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                              Click tag to copy
                            </span>
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                            {visibleTags.map(t => {
                              const isTagCopied = copiedField === t;
                              return (
                                <button
                                  key={t}
                                  type="button"
                                  onClick={() => copyToClipboard(t, t)}
                                  title={`Click to copy ${t}`}
                                  style={{
                                    fontSize: '10.5px',
                                    fontFamily: 'monospace',
                                    background: isTagCopied ? 'rgba(16, 185, 129, 0.15)' : 'rgba(59, 130, 246, 0.08)',
                                    color: isTagCopied ? '#10b981' : '#3b82f6',
                                    border: `1px solid ${isTagCopied ? 'rgba(16, 185, 129, 0.3)' : 'rgba(59, 130, 246, 0.2)'}`,
                                    padding: '2px 6px',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '3px',
                                    transition: 'all 0.12s ease'
                                  }}
                                >
                                  <span>{t}</span>
                                  {isTagCopied ? <Check size={9} /> : <Copy size={8} style={{ opacity: 0.5 }} />}
                                </button>
                              );
                            })}
                          </div>
                          {hasMoreTags && (
                            <button
                              type="button"
                              onClick={() => setExpandedTags(p => ({ ...p, [def.key]: !p[def.key] }))}
                              style={{
                                marginTop: '5px',
                                background: 'none',
                                border: 'none',
                                padding: 0,
                                fontSize: '10.5px',
                                fontWeight: 700,
                                color: 'var(--primary)',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '3px'
                              }}
                            >
                              {isTagsExpanded ? (
                                <><ChevronUp size={11} /> Show fewer variables</>
                              ) : (
                                <><ChevronDown size={11} /> +{def.tags.length - 6} more variables</>
                              )}
                            </button>
                          )}
                        </div>

                        {/* Textarea Template Editor */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <label style={{ fontSize: '10.5px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                              Custom Template
                            </label>
                            <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                              {(evtConfig.template || '').length} chars
                            </span>
                          </div>
                          <textarea
                            className="adm-textarea"
                            rows={4}
                            placeholder={`Automated standard WhatsApp format will be sent. Type custom text with variables above to override...`}
                            value={evtConfig.template || ''}
                            onChange={e => {
                              const updated = { ...config.events, [def.key]: { ...evtConfig, template: e.target.value } };
                              setConfig({ ...config, events: updated });
                            }}
                            style={{
                              fontFamily: 'monospace',
                              fontSize: '11.5px',
                              lineHeight: 1.5,
                              minHeight: '84px',
                              background: 'var(--bg-input)'
                            }}
                          />
                        </div>

                        {/* Card Action Bar */}
                        <div style={{
                          marginTop: 'auto',
                          paddingTop: '10px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '8px',
                          borderTop: '1px solid var(--border)'
                        }}>
                          <button
                            type="button"
                            className="adm-btn adm-btn--sm"
                            onClick={() => handleTogglePreview(def.key)}
                            disabled={previewingKey === def.key}
                            style={{
                              fontSize: '11px',
                              padding: '4px 10px',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '5px',
                              background: previewText ? 'rgba(7, 94, 84, 0.12)' : 'var(--bg-th)',
                              borderColor: previewText ? '#075E54' : 'var(--border)',
                              color: previewText ? '#075E54' : 'var(--text)'
                            }}
                          >
                            {previewingKey === def.key ? (
                              <Loader2 size={11} className="adm-spin" />
                            ) : previewText ? (
                              <EyeOff size={11} />
                            ) : (
                              <Eye size={11} />
                            )}
                            <span>{previewText ? 'Hide Preview' : 'Preview Message'}</span>
                          </button>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                            {evtConfig.template && (
                              <button
                                type="button"
                                title="Reset to standard system default"
                                className="adm-btn adm-btn--sm"
                                style={{ padding: '4px 7px', fontSize: '11px', color: 'var(--text-muted)' }}
                                onClick={() => {
                                  const updated = { ...config.events, [def.key]: { ...evtConfig, template: '' } };
                                  setConfig({ ...config, events: updated });
                                  showToast('info', `Reset ${def.title} to default`);
                                }}
                              >
                                <RotateCcw size={11} />
                              </button>
                            )}
                            <button
                              type="button"
                              title="Copy template text"
                              className="adm-btn adm-btn--sm"
                              style={{ padding: '4px 7px', fontSize: '11px' }}
                              onClick={() => copyToClipboard(evtConfig.template || 'Standard automated message', def.title)}
                            >
                              <Copy size={11} />
                            </button>
                          </div>
                        </div>

                        {/* In-Card WhatsApp Bubble Preview */}
                        {previewText && (
                          <div style={{
                            marginTop: '4px',
                            background: '#075E54',
                            border: '1px solid #128C7E',
                            borderRadius: '10px',
                            overflow: 'hidden',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
                          }}>
                            {/* WhatsApp Header Strip */}
                            <div style={{
                              padding: '6px 10px',
                              background: '#075E54',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              color: '#ffffff'
                            }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 700 }}>
                                <MessageSquare size={12} color="#25D366" />
                                <span>WhatsApp Preview</span>
                                <span style={{ fontSize: '9px', background: '#25D366', color: '#075E54', padding: '0 4px', borderRadius: '3px', fontWeight: 800 }}>LIVE</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => setPreviews(p => { const next = { ...p }; delete next[def.key]; return next; })}
                                style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', padding: '0 4px', fontSize: '11px' }}
                                title="Close preview"
                              >
                                ✕
                              </button>
                            </div>

                            {/* WhatsApp Chat Wallpaper & Bubble */}
                            <div style={{
                              background: '#E5DDD5',
                              backgroundImage: 'radial-gradient(#d4cbbe 1px, transparent 1px)',
                              backgroundSize: '16px 16px',
                              padding: '10px'
                            }}>
                              <div style={{
                                background: '#DCF8C6',
                                color: '#111827',
                                padding: '10px 12px',
                                borderRadius: '8px 8px 2px 8px',
                                fontSize: '11.5px',
                                fontFamily: 'monospace',
                                whiteSpace: 'pre-wrap',
                                lineHeight: 1.55,
                                boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
                                maxWidth: '100%',
                                wordBreak: 'break-word'
                              }}>
                                {previewText}
                                <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '3px', marginTop: '4px', fontSize: '9.5px', color: '#6b7280' }}>
                                  <span>Just now</span>
                                  <CheckCheck size={12} color="#34B7F1" />
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

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
