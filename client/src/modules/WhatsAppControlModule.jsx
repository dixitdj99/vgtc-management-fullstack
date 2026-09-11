import React, { useState, useEffect } from 'react';
import ax from '../api';
import { motion } from 'framer-motion';
import {
  MessageSquare, Send, RefreshCw, CheckCircle2, XCircle, AlertTriangle,
  Settings, Wifi, Shield, Cpu, Info, Copy, Check, ExternalLink, Loader2, Sparkles, Zap, Eye, EyeOff, Phone
} from 'lucide-react';
import TruckLoader from '../components/TruckLoader';

export default function WhatsAppControlModule() {
  const [config, setConfig] = useState({
    enabled: true,
    gatewayUrl: '',
    apiKey: '',
    adminPhone: '8708032492',
    payloadFormat: 'standard',
    events: {
      lr_created_owner: { enabled: true, template: '' },
      lr_created_driver: { enabled: true, template: '' },
      voucher_created_owner: { enabled: true, template: '' },
      voucher_created_driver: { enabled: true, template: '' },
      balance_paid: { enabled: true, template: '' },
      cashout: { enabled: true, template: '' },
      deposit: { enabled: true, template: '' }
    }
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState({ checking: true, connected: false, message: '' });
  const [testForm, setTestForm] = useState({ phone: '', message: '' });
  const [testResult, setTestResult] = useState(null);
  const [copiedCmd, setCopiedCmd] = useState(false);
  const [guideTab, setGuideTab] = useState('ultramsg');
  const [previews, setPreviews] = useState({});
  const [previewingKey, setPreviewingKey] = useState(null);

  const notify = null;  // replaced by showToast below
  const [notifyState, setNotifyState] = useState(null);

  const showToast = (type, message) => {
    setNotifyState({ type, message });
    setTimeout(() => setNotifyState(null), 4000);
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

  useEffect(() => {
    fetchConfig();
    checkConnection();
  }, []);

  const fetchConfig = async () => {
    setLoading(true);
    try {
      const res = await ax.get('/whatsapp/config');
      if (res.data) setConfig(prev => ({ ...prev, ...res.data }));
    } catch (e) {
      console.error('Failed to fetch WhatsApp config', e);
    } finally {
      setLoading(false);
    }
  };

  const checkConnection = async () => {
    setStatus({ checking: true, connected: false, message: 'Pinging WhatsApp Gateway...' });
    try {
      const res = await ax.get('/whatsapp/status');
      setStatus({
        checking: false,
        connected: res.data?.connected || false,
        message: res.data?.connected ? 'Online & Ready to Send' : (res.data?.message || 'Gateway Disconnected')
      });
    } catch (e) {
      setStatus({ checking: false, connected: false, message: 'Gateway Offline or Unreachable' });
    }
  };

  const handleSaveConfig = async (e) => {
    e?.preventDefault();
    setSaving(true);
    try {
      await ax.post('/whatsapp/config', config);
      showToast('success', 'WhatsApp Gateway Configuration Saved Successfully!');
      checkConnection();
    } catch (err) {
      showToast('error', err.response?.data?.error || 'Failed to save gateway configuration');
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
      // Auto-save configuration first so the latest gateway credentials/URL are active on server
      await ax.post('/whatsapp/config', config);
      const res = await ax.post('/whatsapp/test', testForm);
      setTestResult({ success: true, data: res.data });
      showToast('success', '✅ Test WhatsApp message dispatched successfully!');
      checkConnection();
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'WhatsApp message dispatch failed';
      setTestResult({ success: false, error: msg });
      showToast('error', '❌ WhatsApp Dispatch Failed: ' + msg);
    } finally {
      setTesting(false);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopiedCmd(true);
    setTimeout(() => setCopiedCmd(false), 2000);
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '70vh', width: '100%' }}>
        <TruckLoader size={130} text="Loading WhatsApp Gateway configurations..." />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', paddingBottom: '40px' }}>
      {/* Toast Notification Banner */}
      {notifyState && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          style={{
            position: 'fixed', top: '20px', right: '20px', zIndex: 9999,
            background: notifyState.type === 'success' ? 'rgba(16,185,129,0.92)' : 'rgba(239,68,68,0.92)',
            color: '#ffffff', padding: '12px 20px', borderRadius: '12px',
            fontSize: '13px', fontWeight: 700, boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
            display: 'flex', alignItems: 'center', gap: '10px', backdropFilter: 'blur(8px)'
          }}
        >
          {notifyState.type === 'success' ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
          <span>{notifyState.message}</span>
        </motion.div>
      )}

      {/* Header */}
      <div className="page-hd">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '38px', height: '38px', borderRadius: '12px', background: '#25D36620',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <MessageSquare size={22} color="#25D366" />
            </div>
            <div>
              <h2 style={{ fontSize: '20px', fontWeight: 900, margin: 0, color: 'var(--text)' }}>WhatsApp Control Center</h2>
              <p style={{ fontSize: '12px', color: 'var(--text-sub)', margin: 0 }}>Automated WhatsApp notification gateway & message templates</p>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button className="btn btn-g btn-sm" onClick={checkConnection} disabled={status.checking}>
            <RefreshCw size={13} className={status.checking ? 'spin' : ''} /> Check Status
          </button>
        </div>
      </div>

      {/* Gateway Status Badge Banner */}
      <div style={{
        background: status.connected ? 'rgba(37,211,102,0.08)' : 'rgba(239,68,68,0.08)',
        border: `1px solid ${status.connected ? 'rgba(37,211,102,0.25)' : 'rgba(239,68,68,0.25)'}`,
        borderRadius: '14px', padding: '14px 18px', marginBottom: '22px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {status.checking ? (
            <Loader2 size={20} className="spin" color="#25D366" />
          ) : status.connected ? (
            <CheckCircle2 size={22} color="#25D366" />
          ) : (
            <XCircle size={22} color="#ef4444" />
          )}
          <div>
            <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text)' }}>
              Gateway Status: {status.checking ? 'Checking...' : status.connected ? 'ONLINE' : 'OFFLINE / UNREACHABLE'}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-sub)' }}>
              {status.message || 'Configure your WhatsApp API Gateway below'}
            </div>
          </div>
        </div>
        <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: status.connected ? '#25D366' : '#ef4444', background: status.connected ? 'rgba(37,211,102,0.15)' : 'rgba(239,68,68,0.15)', padding: '4px 10px', borderRadius: '8px' }}>
          {status.connected ? 'Active Gateway' : 'Setup Required'}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '22px', marginBottom: '28px' }}>
        {/* Left Column: Gateway Configuration Form */}
        <div className="card" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '18px' }}>
            <Settings size={18} color="#25D366" />
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800 }}>Gateway Connection Settings</h3>
          </div>

          <form onSubmit={handleSaveConfig}>
            {/* Enable/Disable Toggle */}
            <div style={{ marginBottom: '18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-sub)', padding: '12px 14px', borderRadius: '10px' }}>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 700 }}>Enable Automated WhatsApp</div>
                <div style={{ fontSize: '11px', color: 'var(--text-sub)' }}>Master switch for all system event notifications</div>
              </div>
              <input
                type="checkbox"
                checked={config.enabled}
                onChange={e => setConfig({ ...config, enabled: e.target.checked })}
                style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#25D366' }}
              />
            </div>

            {/* Gateway URL */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '6px' }}>
                WhatsApp Gateway Base URL <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="text"
                className="form-control"
                placeholder="e.g. https://api.ultramsg.com/instance12345 or http://192.168.1.100:3000"
                value={config.gatewayUrl || ''}
                onChange={e => setConfig({ ...config, gatewayUrl: e.target.value })}
                required
              />
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                URL of your WhatsApp API instance, Baileys HTTP server, or UltraMsg endpoint.
              </div>
            </div>

            {/* API Key / Token */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '6px' }}>
                API Token / Secret Key
              </label>
              <input
                type="password"
                className="form-control"
                placeholder="e.g. ultramsg_token_xyz or bearer_token"
                value={config.apiKey || ''}
                onChange={e => setConfig({ ...config, apiKey: e.target.value })}
              />
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                Sent in Authorization header or payload token query parameter.
              </div>
            </div>

            {/* Admin Phone */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '6px' }}>
                <Phone size={12} style={{ marginRight: '4px' }} />
                Admin WhatsApp Number
              </label>
              <input
                type="text"
                className="form-control"
                placeholder="e.g. 9416319445 (for deposit & cashout alerts)"
                value={config.adminPhone || ''}
                onChange={e => setConfig({ ...config, adminPhone: e.target.value })}
              />
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                Deposit and cashout alerts will be sent to this number. Leave blank to skip admin alerts.
              </div>
            </div>

            {/* Payload Format */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '6px' }}>
                Gateway Payload Type
              </label>
              <select
                className="form-control"
                value={config.payloadFormat || 'aisensy'}
                onChange={e => setConfig({ ...config, payloadFormat: e.target.value })}
              >
                <option value="aisensy">AiSensy WhatsApp API (Meta Official BSP Partner)</option>
                <option value="standard">Standard JSON API (to, phone, message)</option>
                <option value="ultramsg">UltraMsg WhatsApp API (to, body, token)</option>
                <option value="wppconnect">WPPConnect Gateway Server (/api/send-message)</option>
              </select>
            </div>

            <button type="submit" className="btn btn-p" disabled={saving} style={{ width: '100%', background: '#25D366', color: '#000', fontWeight: 800 }}>
              {saving ? <Loader2 size={15} className="spin" /> : <><Sparkles size={15} /> Save Gateway Settings</>}
            </button>
          </form>
        </div>

        {/* Right Column: Send Test WhatsApp Panel */}
        <div className="card" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '18px' }}>
            <Send size={18} color="#25D366" />
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800 }}>Send Test WhatsApp Message</h3>
          </div>

          <form onSubmit={handleSendTestMsg}>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '6px' }}>
                Recipient Mobile Number
              </label>
              <input
                type="text"
                className="form-control"
                placeholder="e.g. 9876543210 or +919876543210"
                value={testForm.phone}
                onChange={e => setTestForm({ ...testForm, phone: e.target.value })}
                required
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '6px' }}>
                Custom Message (Optional)
              </label>
              <textarea
                className="form-control"
                rows={3}
                placeholder="Leave blank for automatic test notification message..."
                value={testForm.message}
                onChange={e => setTestForm({ ...testForm, message: e.target.value })}
              />
            </div>

            <button type="submit" className="btn btn-g" disabled={testing || !config.gatewayUrl} style={{ width: '100%' }}>
              {testing ? <Loader2 size={15} className="spin" /> : <><Send size={15} /> Dispatch Test Message</>}
            </button>
          </form>

          {testResult && (
            <div style={{
              marginTop: '16px', padding: '12px 14px', borderRadius: '10px', fontSize: '12px',
              background: testResult.success ? 'rgba(37,211,102,0.1)' : 'rgba(239,68,68,0.1)',
              border: `1px solid ${testResult.success ? 'rgba(37,211,102,0.3)' : 'rgba(239,68,68,0.3)'}`,
              color: testResult.success ? '#25D366' : '#ef4444'
            }}>
              <div style={{ fontWeight: 800, marginBottom: '4px' }}>
                {testResult.success ? '✅ WhatsApp Sent Successfully' : '❌ Dispatch Failed'}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-sub)', fontFamily: 'monospace' }}>
                {testResult.success ? JSON.stringify(testResult.data?.result?.gatewayResponse || 'OK') : testResult.error}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Automated Event WhatsApp Message Templates */}
      <div className="card" style={{ padding: '24px', marginBottom: '28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
          <Zap size={18} color="#25D366" />
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800 }}>Automated Event Message Templates</h3>
        </div>
        <p style={{ fontSize: '12px', color: 'var(--text-sub)', marginBottom: '20px' }}>
          Customize WhatsApp message text sent automatically when operational events occur. Use tags like <code>{"{lrNo}"}</code>, <code>{"{truckNo}"}</code>, <code>{"{freight}"}</code>, <code>{"{advance}"}</code>, <code>{"{amount}"}</code>.
        </p>

        <div style={{ display: 'grid', gap: '16px' }}>
          {[
            { key: 'lr_created_owner', title: '1a. LR Created — Owner Copy (Market Vehicles)', desc: 'Truck owner • Full loading receipt with rates', tags: '{lrNo} {truckNo} {date} {partyName} {destination} {totalBags} {totalWeight} {freight} {totalFreight} {billing} {materialsText}' },
            { key: 'lr_created_driver', title: '1b. LR Created — Driver Alert (All Vehicles)', desc: 'Truck driver • Trip dispatch notice without rates', tags: '{lrNo} {truckNo} {date} {partyName} {destination} {totalBags} {totalWeight} {billing}' },
            { key: 'voucher_created_owner', title: '2a. Voucher Created — Owner Copy (Market Vehicles)', desc: 'Truck owner • Freight voucher with full deductions', tags: '{voucherNo} {lrNo} {truckNo} {destination} {grossFreight} {netBalance} {advanceDiesel} {advanceCash} {advanceOnline} {munshi} {commission}' },
            { key: 'voucher_created_driver', title: '2b. Voucher Created — Driver Alert (All Vehicles)', desc: 'Truck driver • Net settlement amount notice', tags: '{voucherNo} {lrNo} {truckNo} {destination} {advanceDiesel} {advanceCash} {munshi} {netBalance} {paymentStatus}' },
            { key: 'balance_paid', title: '3. Balance Payment Batch Sent', desc: 'Truck owner • Payment batch clearance alert', tags: '{truckNo} {tripCount} {periodFrom} {periodTo} {note}' },
            { key: 'cashout', title: '4. Cashbook Cash Out Alert', desc: 'Admin (8708032492)', tags: '{entityName} {entityType} {amount} {remark} {date}' },
            { key: 'deposit', title: '5. Cashbook Deposit Alert', desc: 'Admin (8708032492)', tags: '{amount} {remark} {date}' }
          ].map(evt => {
            const evtConfig = config.events?.[evt.key] || { enabled: true, template: '' };
            const previewText = previews[evt.key];
            return (
              <div key={evt.key} style={{ background: 'var(--bg-sub)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '8px', gap: '10px' }}>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: '13px', fontWeight: 800 }}>{evt.title}</span>
                    <span style={{ fontSize: '11px', color: 'var(--text-sub)', marginLeft: '10px' }}>{evt.desc}</span>
                    <div style={{ marginTop: '4px', fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'monospace', lineHeight: 1.5 }}>
                      Available tags: <span style={{ color: '#25D366' }}>{evt.tags}</span>
                    </div>
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer', fontWeight: 700, flexShrink: 0 }}>
                    <input
                      type="checkbox"
                      checked={evtConfig.enabled !== false}
                      onChange={e => {
                        const updated = { ...config.events, [evt.key]: { ...evtConfig, enabled: e.target.checked } };
                        setConfig({ ...config, events: updated });
                      }}
                      style={{ accentColor: '#25D366' }}
                    />
                    Enable
                  </label>
                </div>
                <textarea
                  className="form-control"
                  rows={4}
                  value={evtConfig.template || ''}
                  onChange={e => {
                    const updated = { ...config.events, [evt.key]: { ...evtConfig, template: e.target.value } };
                    setConfig({ ...config, events: updated });
                  }}
                  style={{ fontSize: '12px', fontFamily: 'monospace', marginBottom: '8px' }}
                />
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <button
                    type="button"
                    className="btn btn-g btn-sm"
                    onClick={() => handlePreviewTemplate(evt.key)}
                    disabled={previewingKey === evt.key}
                    style={{ fontSize: '11px' }}
                  >
                    {previewingKey === evt.key ? <Loader2 size={11} className="spin" /> : <Eye size={11} />}
                    Preview Sample
                  </button>
                  {previewText && (
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Click to toggle preview below</span>
                  )}
                </div>
                {previewText && (
                  <div style={{
                    marginTop: '10px', background: '#0f1117', border: '1px solid #25D36640', borderRadius: '10px',
                    padding: '12px 14px', fontSize: '12px', fontFamily: 'monospace', whiteSpace: 'pre-wrap',
                    color: '#e2e8f0', lineHeight: 1.7, maxHeight: '280px', overflowY: 'auto'
                  }}>
                    <div style={{ fontSize: '10px', color: '#25D366', marginBottom: '6px', fontWeight: 700 }}>📱 PREVIEW (sample data):</div>
                    {previewText}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: '20px', textAlign: 'right' }}>
          <button onClick={handleSaveConfig} className="btn btn-p" disabled={saving} style={{ background: '#25D366', color: '#000', fontWeight: 800 }}>
            {saving ? <Loader2 size={14} className="spin" /> : <><Sparkles size={14} /> Save All Templates</>}
          </button>
        </div>
      </div>

      {/* Setup Guide Card */}
      <div className="card" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
          <Info size={18} color="#25D366" />
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800 }}>WhatsApp Gateway Options & Setup Guide</h3>
        </div>

        <div style={{ display: 'flex', gap: '10px', borderBottom: '1px solid var(--border)', marginBottom: '16px' }}>
          {[
            { id: 'ultramsg', name: 'Option 1: UltraMsg / Cloud API' },
            { id: 'baileys', name: 'Option 2: Self-Hosted Baileys / WPPConnect' },
            { id: 'termux', name: 'Option 3: Phone Local Bridge' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setGuideTab(tab.id)}
              style={{
                background: 'none', border: 'none', borderBottom: guideTab === tab.id ? '2px solid #25D366' : '2px solid transparent',
                padding: '8px 14px', fontSize: '13px', fontWeight: 700, color: guideTab === tab.id ? '#25D366' : 'var(--text-sub)', cursor: 'pointer'
              }}
            >
              {tab.name}
            </button>
          ))}
        </div>

        {guideTab === 'ultramsg' && (
          <div style={{ fontSize: '13px', lineHeight: '1.6', color: 'var(--text-sub)' }}>
            <ol style={{ paddingLeft: '20px', margin: 0 }}>
              <li>Create a free account on UltraMsg or GreenAPI or Twilio.</li>
              <li>Scan the QR code to link your business WhatsApp number.</li>
              <li>Copy your Instance Base URL (e.g. <code>https://api.ultramsg.com/instanceXXXXX</code>) into the Gateway URL field above.</li>
              <li>Set Payload Type to <b>UltraMsg WhatsApp API</b> and paste your API Token.</li>
            </ol>
          </div>
        )}

        {guideTab === 'baileys' && (
          <div style={{ fontSize: '13px', lineHeight: '1.6', color: 'var(--text-sub)' }}>
            <ol style={{ paddingLeft: '20px', margin: 0 }}>
              <li>Run WPPConnect or Baileys Node server on your server / VPS on port 3000.</li>
              <li>Set Gateway URL to <code>http://localhost:3000</code> or your server domain.</li>
              <li>Select <b>WPPConnect Gateway Server</b> or Standard JSON format.</li>
            </ol>
          </div>
        )}

        {guideTab === 'termux' && (
          <div style={{ fontSize: '13px', lineHeight: '1.6', color: 'var(--text-sub)' }}>
            <ol style={{ paddingLeft: '20px', margin: 0 }}>
              <li>Run an HTTP WhatsApp Gateway bridge app or Termux script on an Android phone.</li>
              <li>Expose the local HTTP port via Cloudflare Tunnel or local LAN IP (e.g. <code>http://192.168.1.100:8080</code>).</li>
              <li>Enter the URL into Gateway Base URL above and test connection.</li>
            </ol>
          </div>
        )}
      </div>
    </div>
  );
}
