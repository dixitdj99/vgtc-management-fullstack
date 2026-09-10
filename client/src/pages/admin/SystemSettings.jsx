import React, { useEffect, useState } from 'react';
import { Mail, Save, RefreshCw, AlertTriangle, Server } from 'lucide-react';
import ax from '../../api';
import { useToast } from '../../components/Toast';
import './admin.css';

const DEFAULTS = {
  smtp: { host: 'smtp.gmail.com', port: '587', user: '', pass: '' },
  org: { name: '', phone: '', address: '' },
};

/**
 * SMTP and organisation settings, on /settings.
 *
 * Extracted from AdminPage so the /admin shell can reach it too — it was only
 * available from the in-app Settings tab, which meant an admin working in the
 * standalone panel had no way to fix the mail server that the panel's own user
 * creation depends on.
 *
 * The organisation fields are new. The endpoint has always returned and stored
 * `org`, and AdminPage kept it in state and posted it back, but nothing ever
 * rendered an input for it.
 */
export default function SystemSettings() {
  const { showToast } = useToast() || {};
  const [settings, setSettings] = useState(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await ax.get('/settings');
        if (cancelled || !res.data) return;
        setSettings(s => ({
          smtp: { ...s.smtp, ...(res.data.smtp || {}) },
          org: { ...s.org, ...(res.data.org || {}) },
        }));
      } catch { /* the defaults stand in until the first save */ }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await ax.post('/settings', settings);
      showToast?.('System settings saved', 'success');
    } catch (err) {
      showToast?.(err.response?.data?.error || 'Could not save the settings', 'error');
    } finally {
      setSaving(false);
    }
  };

  const smtp = (k, v) => setSettings(s => ({ ...s, smtp: { ...s.smtp, [k]: v } }));
  const org = (k, v) => setSettings(s => ({ ...s, org: { ...s.org, [k]: v } }));

  return (
    <form className="adm adm-page" onSubmit={save}>
      <div className="adm-note adm-note--warn">
        <AlertTriangle size={16} />
        <span>
          These credentials send the login and user-creation verification codes. A wrong host or app password
          stops anyone with two-factor turned on from signing in, and blocks new accounts from being created.
        </span>
      </div>

      <section className="adm-panel">
        <header className="adm-panel-hd">
          <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
            <span className="adm-icon-tile"><Mail size={18} /></span>
            <div>
              <h2>Outgoing email (SMTP)</h2>
              <p className="adm-sub">Used for one-time codes, password resets and notifications.</p>
            </div>
          </div>
          {loading && <RefreshCw size={14} className="adm-spin" style={{ color: 'var(--text-muted)' }} />}
        </header>
        <div className="adm-panel-bd adm-grid-2">
          <div className="adm-field">
            <label htmlFor="adm-smtp-host">SMTP host</label>
            <input id="adm-smtp-host" className="adm-input" value={settings.smtp.host} onChange={e => smtp('host', e.target.value)} placeholder="smtp.gmail.com" />
          </div>
          <div className="adm-field">
            <label htmlFor="adm-smtp-port">Port</label>
            <input id="adm-smtp-port" className="adm-input" value={settings.smtp.port} onChange={e => smtp('port', e.target.value)} placeholder="587" />
            <span className="adm-hint">587 for STARTTLS, 465 for SSL.</span>
          </div>
          <div className="adm-field">
            <label htmlFor="adm-smtp-user">Sender address</label>
            <input id="adm-smtp-user" className="adm-input" type="email" value={settings.smtp.user} onChange={e => smtp('user', e.target.value)} placeholder="notifications@vgtc.in" />
          </div>
          <div className="adm-field">
            <label htmlFor="adm-smtp-pass">Password or app password</label>
            <input id="adm-smtp-pass" className="adm-input" type="password" value={settings.smtp.pass} onChange={e => smtp('pass', e.target.value)} placeholder="••••••••" autoComplete="off" />
            <span className="adm-hint">Gmail needs an app password, not the account password.</span>
          </div>
        </div>
      </section>

      <section className="adm-panel">
        <header className="adm-panel-hd">
          <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
            <span className="adm-icon-tile" style={{ background: 'rgba(16,185,129,0.14)', color: '#10b981' }}><Server size={18} /></span>
            <div>
              <h2>Organisation</h2>
              <p className="adm-sub">Shown on printed documents and outgoing messages.</p>
            </div>
          </div>
        </header>
        <div className="adm-panel-bd adm-grid-2">
          <div className="adm-field">
            <label htmlFor="adm-org-name">Name</label>
            <input id="adm-org-name" className="adm-input" value={settings.org.name} onChange={e => org('name', e.target.value)} placeholder="VGTC Logistics Management" />
          </div>
          <div className="adm-field">
            <label htmlFor="adm-org-phone">Contact number</label>
            <input id="adm-org-phone" className="adm-input" value={settings.org.phone} onChange={e => org('phone', e.target.value)} placeholder="+91 98120 00000" />
          </div>
          <div className="adm-field" style={{ gridColumn: '1 / -1' }}>
            <label htmlFor="adm-org-address">Address</label>
            <input id="adm-org-address" className="adm-input" value={settings.org.address} onChange={e => org('address', e.target.value)} placeholder="Kosli / Jhajjar / Jharli" />
          </div>
        </div>
      </section>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button type="submit" className="adm-btn adm-btn--primary" disabled={saving || loading}>
          {saving ? <><RefreshCw size={14} className="adm-spin" /> Saving…</> : <><Save size={15} /> Save settings</>}
        </button>
      </div>
    </form>
  );
}
