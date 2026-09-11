import React, { useState, useEffect } from 'react';
import ax from '../api';
import { motion } from 'framer-motion';
import {
  MessageSquare, Send, RefreshCw, CheckCircle2, XCircle, AlertTriangle,
  Settings, Info, Loader2, Sparkles, Zap, Eye, Phone
} from 'lucide-react';
import TruckLoader from '../components/TruckLoader';
import '../pages/admin/admin.css';

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
  const [guideTab, setGuideTab] = useState('ultramsg');
  const [previews, setPreviews] = useState({});
  const [previewingKey, setPreviewingKey] = useState(null);
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

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', width: '100%' }}>
        <TruckLoader size={120} text="Loading WhatsApp Gateway configurations..." />
      </div>
    );
  }

  return (
    <div className="adm adm-page" style={{ paddingBottom: '40px' }}>
      {/* Toast Notification Banner */}
      {notifyState && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          style={{
            position: 'fixed', top: '20px', right: '20px', zIndex: 9999,
            background: notifyState.type === 'success' ? 'var(--primary)' : 'var(--danger)',
            color: '#ffffff', padding: '12px 20px', borderRadius: '12px',
            fontSize: '13px', fontWeight: 700, boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
            display: 'flex', alignItems: 'center', gap: '10px'
          }}
        >
          {notifyState.type === 'success' ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
          <span>{notifyState.message}</span>
        </motion.div>
      )}

      {/* Page Header */}
      <div className="adm-head">
        <div>
          <h1>
            <span className="adm-icon-tile"><MessageSquare size={20} /></span>
            WhatsApp Control Center
          </h1>
          <p>Automated WhatsApp notification gateway & message templates configuration</p>
        </div>
        <div className="adm-head-actions">
          <button type="button" className="adm-btn adm-btn--sm" onClick={checkConnection} disabled={status.checking}>
            <RefreshCw size={13} className={status.checking ? 'adm-spin' : ''} /> Check Status
          </button>
        </div>
      </div>

      {/* Gateway Status Note Banner */}
      <div className={`adm-note ${status.connected ? 'adm-note--success' : 'adm-note--danger'}`}>
        {status.checking ? (
          <Loader2 size={18} className="adm-spin" />
        ) : status.connected ? (
          <CheckCircle2 size={18} />
        ) : (
          <XCircle size={18} />
        )}
        <div style={{ flex: 1 }}>
          <strong style={{ fontSize: '13.5px' }}>
            Gateway Status: {status.checking ? 'Checking...' : status.connected ? 'ONLINE & READY' : 'OFFLINE / UNREACHABLE'}
          </strong>
          <div style={{ fontSize: '11.5px', opacity: 0.85, marginTop: '1px' }}>
            {status.message || 'Configure your WhatsApp API Gateway below'}
          </div>
        </div>
        <span className={`adm-chip ${status.connected ? 'adm-chip--ok' : 'adm-chip--err'}`}>
          {status.connected ? 'Active Gateway' : 'Setup Required'}
        </span>
      </div>

      {/* Grid: Gateway Connection Settings + Test Dispatch */}
      <div className="adm-grid-2">
        {/* Panel 1: Gateway Configuration Form */}
        <section className="adm-panel">
          <header className="adm-panel-hd">
            <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
              <span className="adm-icon-tile"><Settings size={18} /></span>
              <div>
                <h2>Gateway Connection Settings</h2>
                <p className="adm-sub">Configure API instance URL, token & default admin phone</p>
              </div>
            </div>
          </header>

          <form onSubmit={handleSaveConfig} className="adm-panel-bd adm-sec">
            {/* Enable/Disable Toggle */}
            <div className="adm-toggle-row">
              <div className="adm-toggle-text">
                <div className="adm-toggle-name">Enable Automated WhatsApp</div>
                <div className="adm-toggle-hint">Master switch for all system event notifications</div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={config.enabled}
                className="adm-switch"
                onClick={() => setConfig({ ...config, enabled: !config.enabled })}
              />
            </div>

            {/* Gateway Base URL */}
            <div className="adm-field">
              <label htmlFor="wa-gateway-url">
                WhatsApp Gateway Base URL <span className="adm-req">*</span>
              </label>
              <input
                id="wa-gateway-url"
                type="text"
                className="adm-input"
                placeholder="e.g. https://api.ultramsg.com/instance12345 or http://192.168.1.100:3000"
                value={config.gatewayUrl || ''}
                onChange={e => setConfig({ ...config, gatewayUrl: e.target.value })}
                required
              />
              <span className="adm-hint">URL of your WhatsApp API instance, Baileys HTTP server, or UltraMsg endpoint.</span>
            </div>

            {/* API Token / Secret Key */}
            <div className="adm-field">
              <label htmlFor="wa-api-key">API Token / Secret Key</label>
              <input
                id="wa-api-key"
                type="password"
                className="adm-input"
                placeholder="e.g. ultramsg_token_xyz or bearer_token"
                value={config.apiKey || ''}
                onChange={e => setConfig({ ...config, apiKey: e.target.value })}
              />
              <span className="adm-hint">Sent in Authorization header or payload token query parameter.</span>
            </div>

            {/* Admin Phone */}
            <div className="adm-field">
              <label htmlFor="wa-admin-phone">
                <Phone size={11} /> Admin WhatsApp Number
              </label>
              <input
                id="wa-admin-phone"
                type="text"
                className="adm-input"
                placeholder="e.g. 8708032492"
                value={config.adminPhone || ''}
                onChange={e => setConfig({ ...config, adminPhone: e.target.value })}
              />
              <span className="adm-hint">Deposit & cashout alerts will be sent to this number. Default: 8708032492.</span>
            </div>

            {/* Payload Format */}
            <div className="adm-field">
              <label htmlFor="wa-payload-format">Gateway Payload Type</label>
              <select
                id="wa-payload-format"
                className="adm-select"
                value={config.payloadFormat || 'aisensy'}
                onChange={e => setConfig({ ...config, payloadFormat: e.target.value })}
              >
                <option value="aisensy">AiSensy WhatsApp API (Meta Official BSP Partner)</option>
                <option value="standard">Standard JSON API (to, phone, message)</option>
                <option value="ultramsg">UltraMsg WhatsApp API (to, body, token)</option>
                <option value="wppconnect">WPPConnect Gateway Server (/api/send-message)</option>
              </select>
            </div>

            <button type="submit" className="adm-btn adm-btn--primary adm-btn--block" disabled={saving}>
              {saving ? <Loader2 size={15} className="adm-spin" /> : <><Sparkles size={15} /> Save Gateway Settings</>}
            </button>
          </form>
        </section>

        {/* Panel 2: Send Test WhatsApp Message */}
        <section className="adm-panel">
          <header className="adm-panel-hd">
            <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
              <span className="adm-icon-tile"><Send size={18} /></span>
              <div>
                <h2>Send Test WhatsApp Message</h2>
                <p className="adm-sub">Dispatch a live test message to verify your connection</p>
              </div>
            </div>
          </header>

          <form onSubmit={handleSendTestMsg} className="adm-panel-bd adm-sec">
            <div className="adm-field">
              <label htmlFor="wa-test-phone">Recipient Mobile Number <span className="adm-req">*</span></label>
              <input
                id="wa-test-phone"
                type="text"
                className="adm-input"
                placeholder="e.g. 9876543210 or +919876543210"
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
                rows={3}
                placeholder="Leave blank for automatic test notification message..."
                value={testForm.message}
                onChange={e => setTestForm({ ...testForm, message: e.target.value })}
              />
            </div>

            <button type="submit" className="adm-btn adm-btn--primary adm-btn--block" disabled={testing || !config.gatewayUrl}>
              {testing ? <Loader2 size={15} className="adm-spin" /> : <><Send size={15} /> Dispatch Test Message</>}
            </button>

            {testResult && (
              <div className={`adm-note ${testResult.success ? 'adm-note--success' : 'adm-note--danger'}`}>
                <div>
                  <strong>{testResult.success ? '✅ WhatsApp Sent Successfully' : '❌ Dispatch Failed'}</strong>
                  <div style={{ fontSize: '11px', fontFamily: 'monospace', marginTop: '2px' }}>
                    {testResult.success ? JSON.stringify(testResult.data?.result?.gatewayResponse || 'OK') : testResult.error}
                  </div>
                </div>
              </div>
            )}
          </form>
        </section>
      </div>

      {/* Section 3: Automated Event Message Templates */}
      <section className="adm-panel">
        <header className="adm-panel-hd">
          <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
            <span className="adm-icon-tile"><Zap size={18} /></span>
            <div>
              <h2>Automated Event Message Templates</h2>
              <p className="adm-sub">Customize WhatsApp text sent automatically when operational events occur.</p>
            </div>
          </div>
          <button onClick={handleSaveConfig} className="adm-btn adm-btn--primary adm-btn--sm" disabled={saving}>
            {saving ? <Loader2 size={14} className="adm-spin" /> : <><Sparkles size={14} /> Save All Templates</>}
          </button>
        </header>

        <div className="adm-panel-bd adm-sec">
          {[
            { key: 'lr_created_owner', title: '1a. LR Created — Owner Copy (Market Vehicles)', desc: 'Truck owner • Full loading receipt with freight rates', tags: '{lrNo} {truckNo} {date} {partyName} {destination} {totalBags} {totalWeight} {freight} {totalFreight} {billing} {materialsText}' },
            { key: 'lr_created_driver', title: '1b. LR Created — Driver Alert (All Vehicles)', desc: 'Truck driver • Trip dispatch notice without freight rates', tags: '{lrNo} {truckNo} {date} {partyName} {destination} {totalBags} {totalWeight} {billing}' },
            { key: 'voucher_created_owner', title: '2a. Voucher Created — Owner Copy (Market Vehicles)', desc: 'Truck owner • Freight voucher with full deduction breakdown', tags: '{voucherNo} {lrNo} {truckNo} {destination} {grossFreight} {netBalance} {advanceDiesel} {advanceCash} {advanceOnline} {munshi} {commission}' },
            { key: 'voucher_created_driver', title: '2b. Voucher Created — Driver Alert (All Vehicles)', desc: 'Truck driver • Net settlement amount notice', tags: '{voucherNo} {lrNo} {truckNo} {destination} {advanceDiesel} {advanceCash} {munshi} {netBalance} {paymentStatus}' },
            { key: 'balance_paid', title: '3. Balance Payment Batch Sent', desc: 'Truck owner • Payment batch clearance notification', tags: '{truckNo} {tripCount} {periodFrom} {periodTo} {note}' },
            { key: 'cashout', title: '4. Cashbook Cash Out Alert', desc: 'Admin (8708032492)', tags: '{entityName} {entityType} {amount} {remark} {date}' },
            { key: 'deposit', title: '5. Cashbook Deposit Alert', desc: 'Admin (8708032492)', tags: '{amount} {remark} {date}' }
          ].map(evt => {
            const evtConfig = config.events?.[evt.key] || { enabled: true, template: '' };
            const previewText = previews[evt.key];
            return (
              <div key={evt.key} className="adm-panel" style={{ background: 'var(--bg-th)', border: '1px solid var(--border)' }}>
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
                      <div style={{ fontSize: '10.5px', fontWeight: 800, color: 'var(--primary)', marginBottom: '6px' }}>📱 SAMPLE WHATSAPP MESSAGE PREVIEW:</div>
                      {previewText}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Section 4: Setup Guide */}
      <section className="adm-panel">
        <header className="adm-panel-hd">
          <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
            <span className="adm-icon-tile"><Info size={18} /></span>
            <div>
              <h2>WhatsApp Gateway Setup Guide</h2>
              <p className="adm-sub">Options & instructions for connecting your gateway</p>
            </div>
          </div>
        </header>

        <div className="adm-panel-bd adm-sec">
          <div className="adm-tabs">
            {[
              { id: 'ultramsg', name: 'Option 1: UltraMsg / Cloud API' },
              { id: 'baileys', name: 'Option 2: Self-Hosted Baileys / WPPConnect' },
              { id: 'termux', name: 'Option 3: Phone Local Bridge' }
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={guideTab === tab.id}
                className="adm-tab"
                onClick={() => setGuideTab(tab.id)}
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
      </section>
    </div>
  );
}
