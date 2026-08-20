import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ShieldCheck, ShieldAlert, Plus, Trash2, User, X, Check, RefreshCw, Crown,
  Users, Truck, Eye, EyeOff, ExternalLink, Search, Pencil, Mail, KeyRound, MailCheck,
  ArrowLeft, AlertTriangle, Info, UserPlus, Copy, CheckCheck, Wand2, HardHat, SearchX,
} from 'lucide-react';
import ax from '../../api';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../components/Toast';
import ConfirmDialog from '../../components/ConfirmDialog';
import PermissionEditor from '../../components/PermissionEditor';
import { summarise, LOCATIONS } from '../../permissions/catalogue';
import './admin.css';

const API = '/users';
const ROLES = [
  { value: 'user', label: 'User', hint: 'Sees only what is granted below', Icon: Users, color: '#10b981' },
  { value: 'admin', label: 'Admin', hint: 'Full access to every screen and this panel', Icon: Crown, color: '#ef4444' },
];
const ROLE_COLOR = Object.fromEntries(ROLES.map(r => [r.value, r.color]));

const GODOWNS = [
  { value: 'kosli', label: 'Kosli', color: '#6366f1' },
  { value: 'jhajjar', label: 'Jhajjar', color: '#14b8a6' },
  { value: 'bahadurgarh', label: 'Bahadurgarh', color: '#d97706' },
  { value: 'jkl', label: 'JK Lakshmi', color: '#f59e0b' },
  { value: 'dump', label: 'Dump — JK Super general', color: '#f43f5e' },
];
const GODOWN = Object.fromEntries(GODOWNS.map(g => [g.value, g]));

const OTP_LENGTH = 6;
const RESEND_SECONDS = 30;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const initials = (name = '') => (name.trim()[0] || 'U').toUpperCase();
const errorText = (err, fallback) => err?.response?.data?.error || err?.message || fallback;

/** What an account can actually reach, in one phrase. */
function accessSummary(u) {
  if (u.role === 'admin') return { text: 'Full access', tone: 'danger' };
  const { granted, total } = summarise(u.permissions || {});
  if (!granted) return { text: 'No access', tone: 'muted' };
  const plants = u.permissions?.allowedPlants;
  const locCount = Array.isArray(plants)
    ? LOCATIONS.filter(l => plants.includes(l.plantKey)
      && (!l.godownKey || !Array.isArray(u.permissions?.allowedGodowns) || u.permissions.allowedGodowns.includes(l.godownKey))).length
    : LOCATIONS.length;
  return { text: `${granted}/${total} modules · ${locCount} loc`, tone: 'info' };
}

/* ═══════════════════════════ Small pieces ═══════════════════════════ */

function Avatar({ name, color = '#6366f1', large = false }) {
  return (
    <span
      className={`adm-avatar${large ? ' adm-avatar--lg' : ''}`}
      style={{ background: `${color}22`, color, border: `1px solid ${color}44` }}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}

function Checkbox({ checked, mixed = false, onChange, label }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={mixed ? 'mixed' : checked}
      aria-label={label}
      className="adm-check"
      data-mixed={mixed ? 'true' : undefined}
      onClick={(e) => { e.stopPropagation(); onChange(!checked); }}
    >
      {mixed ? <span style={{ width: 9, height: 2, background: 'currentColor', borderRadius: 1 }} /> : <Check size={12} strokeWidth={3.5} />}
    </button>
  );
}

function Switch({ checked, onChange, label, disabled = false }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className="adm-switch"
      onClick={() => onChange(!checked)}
    />
  );
}

const NATIVE_CONTROLS = ['input', 'select', 'textarea'];

/**
 * Label above a control. When the child is a bare input the label is wired to
 * it with a generated id, so clicking the label focuses the field and a screen
 * reader reads the two together. Wrapped controls (the password boxes, which sit
 * inside a relative div for their reveal buttons) carry their own aria-label
 * instead — an htmlFor pointing at a div associates nothing.
 */
function Field({ label, required, error, hint, children }) {
  const autoId = useId();
  const wired = React.isValidElement(children) && NATIVE_CONTROLS.includes(children.type);
  const controlId = wired ? (children.props.id || autoId) : undefined;
  const control = wired ? React.cloneElement(children, { id: controlId }) : children;

  return (
    <div className="adm-field">
      <label htmlFor={controlId}>{label}{required && <span className="adm-req">*</span>}</label>
      {control}
      {error ? <span className="adm-error"><AlertTriangle size={12} /> {error}</span> : hint ? <span className="adm-hint">{hint}</span> : null}
    </div>
  );
}

/** Secret with reveal and copy — used for the generated password and the stored one. */
function SecretValue({ value }) {
  const [show, setShow] = useState(false);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch { /* clipboard blocked — the reveal button still works */ }
  };

  if (!value) return <span className="adm-hint">Not stored for this account</span>;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <code style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-sub)', letterSpacing: show ? 0 : '0.18em' }}>
        {show ? value : '•'.repeat(Math.min(value.length, 12))}
      </code>
      <button type="button" className="adm-input-btn" onClick={() => setShow(s => !s)} aria-label={show ? 'Hide password' : 'Show password'}>
        {show ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
      <button type="button" className="adm-input-btn" onClick={copy} aria-label="Copy password">
        {copied ? <CheckCheck size={14} color="#10b981" /> : <Copy size={14} />}
      </button>
    </div>
  );
}

/** Six boxes that behave like one field: auto-advance, backspace, paste. */
function OtpInput({ value, onChange, disabled }) {
  const refs = useRef([]);
  const chars = value.padEnd(OTP_LENGTH, ' ').slice(0, OTP_LENGTH).split('');

  const write = (i, char) => {
    const next = chars.map(c => (c === ' ' ? '' : c));
    next[i] = char;
    onChange(next.join('').replace(/\s/g, '').slice(0, OTP_LENGTH));
  };

  return (
    <div className="adm-otp">
      {chars.map((c, i) => (
        <input
          key={i}
          ref={el => { refs.current[i] = el; }}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={1}
          disabled={disabled}
          aria-label={`Digit ${i + 1} of ${OTP_LENGTH}`}
          value={c.trim()}
          onChange={e => {
            const digit = e.target.value.replace(/\D/g, '').slice(-1);
            write(i, digit);
            if (digit && i < OTP_LENGTH - 1) refs.current[i + 1]?.focus();
          }}
          onKeyDown={e => {
            if (e.key === 'Backspace' && !c.trim() && i > 0) refs.current[i - 1]?.focus();
            if (e.key === 'ArrowLeft' && i > 0) refs.current[i - 1]?.focus();
            if (e.key === 'ArrowRight' && i < OTP_LENGTH - 1) refs.current[i + 1]?.focus();
          }}
          onPaste={e => {
            const digits = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, OTP_LENGTH);
            if (!digits) return;
            e.preventDefault();
            onChange(digits);
            refs.current[Math.min(digits.length, OTP_LENGTH - 1)]?.focus();
          }}
        />
      ))}
    </div>
  );
}

function RowSkeleton() {
  return (
    <div className="adm-row" style={{ cursor: 'default' }}>
      <span />
      <div className="adm-row-main">
        <span className="adm-skel" style={{ width: 38, height: 38, borderRadius: '50%' }} />
        <div style={{ flex: 1 }}>
          <div className="adm-skel" style={{ width: '45%', height: 12, marginBottom: 6 }} />
          <div className="adm-skel" style={{ width: '65%', height: 10 }} />
        </div>
      </div>
      <div className="adm-col-hide"><span className="adm-skel" style={{ width: 60, height: 18, borderRadius: 999, display: 'block' }} /></div>
      <div className="adm-col-hide"><span className="adm-skel" style={{ width: 90, height: 12, display: 'block' }} /></div>
      <span className="adm-skel" style={{ width: 32, height: 32, borderRadius: 8 }} />
    </div>
  );
}

/* ═══════════════════════════ Drawer ═══════════════════════════ */

const blankForm = { name: '', username: '', password: '', role: 'user', email: '', isOtpEnabled: false, permissions: {} };

/**
 * A stable string for the dirty check.
 *
 * Comparing two `JSON.stringify` calls only works when both sides were built in
 * the same key order, and permission keys arrive in whatever order the toggles
 * happened to write them. Sorting the grants and dropping the empty ones means
 * "granted then revoked" reads as no change, which is what an admin expects.
 */
const fingerprint = (f) => JSON.stringify({
  name: (f.name || '').trim(),
  username: (f.username || '').trim(),
  password: f.password || '',
  role: f.role,
  email: (f.email || '').trim(),
  isOtpEnabled: !!f.isOtpEnabled,
  permissions: Object.entries(f.permissions || {})
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => [k, Array.isArray(v) ? [...v].sort() : v]),
});

/**
 * Create and edit both live here. Creating takes two passes — Stytch mails a
 * code, then the code plus the details create the account — so the drawer keeps
 * a `step`, and everything typed in step one stays put while the code is
 * verified rather than being re-entered on failure.
 */
function UserDrawer({ mode, target, users, me, onClose, onSaved }) {
  const { showToast } = useToast() || {};
  const isEdit = mode === 'edit';

  const [initial] = useState(() => (isEdit
    ? {
      name: target.name || '', username: target.username || '', password: '',
      role: target.role || 'user', email: target.email || '',
      isOtpEnabled: !!target.isOtpEnabled, permissions: target.permissions || {},
    }
    : { ...blankForm }));

  const [form, setForm] = useState(initial);
  const [snapshot] = useState(() => fingerprint(initial));

  const [step, setStep] = useState('details'); // 'details' | 'verify'
  const [methodId, setMethodId] = useState('');
  const [otp, setOtp] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [busy, setBusy] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [banner, setBanner] = useState(null); // { tone, text }
  const [confirmClose, setConfirmClose] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const bodyRef = useRef(null);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const dirty = useMemo(() => fingerprint(form) !== snapshot, [form, snapshot]);

  const isSelf = isEdit && target.id === me?.id;
  const adminCount = users.filter(u => u.role === 'admin').length;
  const lastAdmin = isEdit && target.role === 'admin' && adminCount <= 1;

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const t = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const requestClose = useCallback(() => {
    if (dirty) setConfirmClose(true);
    else onClose();
  }, [dirty, onClose]);

  // Two effects, not one: `requestClose` changes identity every time `dirty`
  // flips, and folding the scroll lock in with it would re-run the lock, capture
  // its own "hidden" as the value to restore, and leave the page unscrollable
  // after the drawer closed.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') requestClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [requestClose]);

  // ── Validation ────────────────────────────────────────────────

  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = 'Required';
    if (!isEdit) {
      const uname = form.username.trim();
      if (!uname) e.username = 'Required';
      else if (uname.length < 3) e.username = 'At least 3 characters';
      else if (users.some(u => (u.username || '').toLowerCase() === uname.toLowerCase())) e.username = 'Already taken';
      if (!form.password) e.password = 'Required';
      else if (form.password.length < 6) e.password = 'At least 6 characters';
    } else if (form.password && form.password.length < 6) {
      e.password = 'At least 6 characters';
    }
    if (!form.email.trim()) e.email = 'Required';
    else if (!EMAIL_RE.test(form.email.trim())) e.email = 'Not a valid address';
    setFieldErrors(e);
    if (Object.keys(e).length) bodyRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    return Object.keys(e).length === 0;
  };

  const generatePassword = () => {
    const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = new Uint32Array(12);
    crypto.getRandomValues(bytes);
    set('password', Array.from(bytes, n => alphabet[n % alphabet.length]).join(''));
    setShowPassword(true);
    setFieldErrors(e => ({ ...e, password: undefined }));
  };

  // ── Actions ───────────────────────────────────────────────────

  const sendCode = async () => {
    if (!validate()) return;
    setBusy(true); setBanner(null);
    try {
      const res = await ax.post(`${API}/send-otp`, { email: form.email.trim() });
      setMethodId(res.data.methodId);
      setStep('verify');
      setOtp('');
      setCooldown(RESEND_SECONDS);
      setBanner({ tone: 'success', text: `Verification code sent to ${form.email.trim()}` });
      showToast?.(`Verification code sent to ${form.email.trim()}`, 'success');
    } catch (err) {
      const msg = errorText(err, 'Could not send the verification code');
      setBanner({ tone: 'danger', text: msg });
      showToast?.(msg, 'error');
    } finally { setBusy(false); }
  };

  const resendCode = async () => {
    if (cooldown > 0) return;
    setBusy(true); setBanner(null);
    try {
      const res = await ax.post(`${API}/send-otp`, { email: form.email.trim() });
      setMethodId(res.data.methodId);
      setOtp('');
      setCooldown(RESEND_SECONDS);
      setBanner({ tone: 'success', text: `A new code is on its way to ${form.email.trim()}` });
    } catch (err) {
      const msg = errorText(err, 'Could not resend the code');
      setBanner({ tone: 'danger', text: msg });
      showToast?.(msg, 'error');
    } finally { setBusy(false); }
  };

  const createUser = async () => {
    if (otp.length !== OTP_LENGTH) {
      setBanner({ tone: 'danger', text: `Enter all ${OTP_LENGTH} digits` });
      return;
    }
    setBusy(true); setBanner(null);
    try {
      await ax.post(API, {
        name: form.name.trim(),
        username: form.username.trim(),
        password: form.password,
        role: form.role,
        email: form.email.trim(),
        isOtpEnabled: form.isOtpEnabled,
        // Sent even for admins: the role bypasses them today, but keeping the
        // grants means demoting the account later restores what was chosen here.
        permissions: form.permissions,
        otpCode: otp,
        methodId,
      });
      showToast?.(`${form.name.trim()} can now sign in`, 'success');
      onSaved();
    } catch (err) {
      const msg = errorText(err, 'Could not create the account');
      setBanner({ tone: 'danger', text: msg });
      showToast?.(msg, 'error');
    } finally { setBusy(false); }
  };

  const saveUser = async () => {
    if (!validate()) return;
    setBusy(true); setBanner(null);
    try {
      const payload = {
        name: form.name.trim(),
        email: form.email.trim(),
        role: form.role,
        isOtpEnabled: form.isOtpEnabled,
        permissions: form.permissions,
      };
      if (form.password) payload.password = form.password;
      await ax.patch(`${API}/${target.id}`, payload);
      showToast?.(`${form.name.trim()} updated`, 'success');
      onSaved();
    } catch (err) {
      const msg = errorText(err, 'Could not save the changes');
      setBanner({ tone: 'danger', text: msg });
      showToast?.(msg, 'error');
    } finally { setBusy(false); }
  };

  const verifying = step === 'verify';
  const roleColor = ROLE_COLOR[form.role] || '#6366f1';

  return (
    <>
      <motion.div
        className="adm-scrim"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={requestClose}
      />
      <motion.aside
        className="adm adm-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={isEdit ? `Edit ${target.name}` : 'Create user account'}
        initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
        transition={{ type: 'spring', stiffness: 320, damping: 34 }}
      >
        <header className="adm-drawer-hd">
          <div className="adm-drawer-title">
            {isEdit
              ? <Avatar name={target.name} color={roleColor} large />
              : <span className="adm-icon-tile" style={{ width: 46, height: 46 }}><UserPlus size={21} /></span>}
            <div style={{ minWidth: 0 }}>
              <h2>{isEdit ? target.name : 'Create user account'}</h2>
              <p>
                {isEdit
                  ? `@${target.username}${target.email ? ` · ${target.email}` : ''}`
                  : verifying ? `Step 2 of 2 — confirm the code sent to ${form.email}` : 'Step 1 of 2 — account details and access'}
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {isEdit && isSelf && <span className="adm-chip adm-chip--info">You</span>}
            {dirty && <span className="adm-chip adm-chip--warn">Unsaved</span>}
            <button type="button" className="adm-btn adm-btn--ghost adm-btn--icon adm-btn--sm" onClick={requestClose} aria-label="Close panel">
              <X size={18} />
            </button>
          </div>
        </header>

        <div className="adm-drawer-bd" ref={bodyRef}>
          {banner && (
            <div className={`adm-note adm-note--${banner.tone}`}>
              {banner.tone === 'danger' ? <AlertTriangle size={16} /> : <MailCheck size={16} />}
              <span>{banner.text}</span>
            </div>
          )}

          {verifying ? (
            <>
              <div className="adm-note adm-note--info">
                <Info size={16} />
                <span>The account is created only after this code is accepted. Nothing typed in step one has been lost.</span>
              </div>

              <div className="adm-panel">
                <header className="adm-panel-hd">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                    <span className="adm-icon-tile" style={{ background: 'rgba(16,185,129,0.14)', color: '#10b981' }}><MailCheck size={18} /></span>
                    <div>
                      <h2>Enter the 6-digit code</h2>
                      <p className="adm-sub">Sent to {form.email}</p>
                    </div>
                  </div>
                  <button type="button" className="adm-link adm-link--accent" onClick={resendCode} disabled={busy || cooldown > 0}>
                    {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
                  </button>
                </header>
                <div className="adm-panel-bd" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <OtpInput value={otp} onChange={setOtp} disabled={busy} />
                  <button type="button" className="adm-link" style={{ alignSelf: 'center' }} onClick={() => { setStep('details'); setBanner(null); }}>
                    <ArrowLeft size={12} style={{ verticalAlign: -2 }} /> Change the details or email
                  </button>
                </div>
              </div>

              <div className="adm-panel">
                <header className="adm-panel-hd"><h2>About to be created</h2></header>
                <div className="adm-panel-bd" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {[
                    ['Name', form.name],
                    ['Username', `@${form.username}`],
                    ['Role', ROLES.find(r => r.value === form.role)?.label],
                    ['Two-factor at login', form.isOtpEnabled ? 'On' : 'Off'],
                    ['Modules granted', form.role === 'admin' ? 'Every module (admin)' : `${summarise(form.permissions).granted} of ${summarise(form.permissions).total}`],
                  ].map(([l, v]) => (
                    <div key={l} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12.5 }}>
                      <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>{l}</span>
                      <strong style={{ color: 'var(--text)' }}>{v}</strong>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <>
              {/* ── Account details ──
                  Flat, not carded. Four inputs inside a card inside a drawer is
                  three borders deep, and the panel header naming them scrolled
                  off the top with the first field. */}
              <section className="adm-sec">
                <div className="adm-sec-hd">
                  <h3>Account details</h3>
                  <span className="adm-sec-note">How this person signs in</span>
                </div>

                <div className="adm-fields">
                  <Field label="Full name" required error={fieldErrors.name}>
                    <input
                      className={`adm-input${fieldErrors.name ? ' adm-input--invalid' : ''}`}
                      value={form.name}
                      onChange={e => set('name', e.target.value)}
                      placeholder="Ramesh Kumar"
                      autoFocus
                    />
                  </Field>

                  <Field
                    label="Username"
                    required
                    error={fieldErrors.username}
                    hint={isEdit ? 'Cannot be changed' : 'Lower-case, no spaces'}
                  >
                    <input
                      className={`adm-input${fieldErrors.username ? ' adm-input--invalid' : ''}`}
                      value={form.username}
                      disabled={isEdit}
                      onChange={e => set('username', e.target.value.toLowerCase().replace(/\s/g, ''))}
                      placeholder="ramesh"
                    />
                  </Field>

                  <Field
                    label="Email address"
                    required
                    error={fieldErrors.email}
                    hint={isEdit ? 'Password resets and two-factor codes' : 'The verification code is sent here'}
                  >
                    <input
                      className={`adm-input${fieldErrors.email ? ' adm-input--invalid' : ''}`}
                      type="email"
                      value={form.email}
                      onChange={e => set('email', e.target.value)}
                      placeholder="ramesh@company.com"
                    />
                  </Field>

                  <Field
                    label={isEdit ? 'New password' : 'Password'}
                    required={!isEdit}
                    error={fieldErrors.password}
                    hint={isEdit ? 'Blank keeps the current one' : 'At least 6 characters'}
                  >
                    <div className="adm-input-wrap">
                      <input
                        className={`adm-input${fieldErrors.password ? ' adm-input--invalid' : ''}`}
                        type={showPassword ? 'text' : 'password'}
                        value={form.password}
                        onChange={e => set('password', e.target.value)}
                        placeholder={isEdit ? 'Unchanged' : 'Set a password'}
                        autoComplete="new-password"
                        aria-label={isEdit ? 'New password' : 'Password'}
                      />
                      <span className="adm-input-actions">
                        <button type="button" className="adm-input-btn" onClick={generatePassword} title="Generate a strong password">
                          <Wand2 size={14} />
                        </button>
                        <button type="button" className="adm-input-btn" onClick={() => setShowPassword(s => !s)} aria-label={showPassword ? 'Hide password' : 'Show password'}>
                          {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                      </span>
                    </div>
                  </Field>

                  {isEdit && (
                    <Field label="Current stored password">
                      <SecretValue value={target.plainPassword} />
                    </Field>
                  )}
                </div>

                <div className="adm-toggle-row">
                  <span className="adm-perm-icon" style={{ background: 'rgba(16,185,129,0.14)', color: '#10b981' }}><KeyRound size={17} /></span>
                  <div className="adm-toggle-text">
                    <div className="adm-toggle-name">Two-factor at login</div>
                    <div className="adm-toggle-hint">Email a one-time code every time this account signs in.</div>
                  </div>
                  <Switch checked={form.isOtpEnabled} onChange={v => set('isOtpEnabled', v)} label="Two-factor at login" />
                </div>
              </section>

              {/* ── Role ── */}
              <section className="adm-sec">
                <div className="adm-sec-hd">
                  <h3>Role</h3>
                  <span className="adm-sec-note">Sets the ceiling — permissions below work inside it</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div className="adm-fields">
                    {ROLES.map(r => {
                      const active = form.role === r.value;
                      const locked = isSelf && r.value !== 'admin';
                      return (
                        <button
                          key={r.value}
                          type="button"
                          disabled={locked}
                          onClick={() => set('role', r.value)}
                          title={locked ? 'You cannot remove your own admin role' : r.hint}
                          style={{
                            display: 'flex', alignItems: 'flex-start', gap: 11, padding: '13px 14px',
                            minHeight: 66, height: 'auto', whiteSpace: 'normal',
                            borderRadius: 12, cursor: locked ? 'not-allowed' : 'pointer', textAlign: 'left',
                            border: `1.5px solid ${active ? r.color : 'var(--border)'}`,
                            background: active ? `${r.color}14` : 'var(--bg-input)',
                            opacity: locked ? 0.5 : 1, font: 'inherit', transition: 'all 0.15s',
                          }}
                        >
                          <r.Icon size={18} color={active ? r.color : 'var(--text-muted)'} style={{ flexShrink: 0, marginTop: 1 }} />
                          <span style={{ minWidth: 0 }}>
                            <span style={{ display: 'block', fontSize: 13, fontWeight: 800, color: active ? r.color : 'var(--text)' }}>{r.label}</span>
                            <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2, lineHeight: 1.4 }}>{r.hint}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {isSelf && (
                    <div className="adm-note adm-note--info">
                      <Info size={15} />
                      <span>This is your own account. Dropping yourself to User would lock you out of this panel, so the choice is fixed.</span>
                    </div>
                  )}
                  {lastAdmin && form.role !== 'admin' && (
                    <div className="adm-note adm-note--danger">
                      <ShieldAlert size={15} />
                      <span>This is the only administrator left. Changing the role would leave the organisation with nobody who can manage users.</span>
                    </div>
                  )}
                </div>
              </section>

              {/* ── Permissions ── */}
              {form.role === 'admin' ? (
                <section className="adm-sec">
                  <div className="adm-sec-hd">
                    <h3>Module access</h3>
                    <span className="adm-sec-note">Not applicable to administrators</span>
                  </div>
                  <div className="adm-note adm-note--warn">
                    <ShieldCheck size={16} />
                    <span>Administrators bypass module permissions entirely — every plant, every screen, plus this panel. Switch the role to <strong>User</strong> to grant access module by module.</span>
                  </div>
                </section>
              ) : (
                <PermissionEditor
                  permissions={form.permissions}
                  onChange={next => set('permissions', next)}
                  users={users.filter(u => u.id !== target?.id && u.role !== 'admin')}
                  resetKey={String(target?.id || 'new')}
                  showChanges={isEdit}
                />
              )}
            </>
          )}
        </div>

        <footer className="adm-drawer-ft" style={{ justifyContent: 'flex-end' }}>
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" className="adm-btn" onClick={requestClose} disabled={busy}>Cancel</button>
            {isEdit && (
              <button type="button" className="adm-btn adm-btn--primary" onClick={saveUser} disabled={busy || !dirty}>
                {busy ? <><RefreshCw size={14} className="adm-spin" /> Saving…</> : <><Check size={15} /> Save changes</>}
              </button>
            )}
            {!isEdit && !verifying && (
              <button type="button" className="adm-btn adm-btn--primary" onClick={sendCode} disabled={busy}>
                {busy ? <><RefreshCw size={14} className="adm-spin" /> Sending…</> : <><Mail size={15} /> Send verification code</>}
              </button>
            )}
            {!isEdit && verifying && (
              <button type="button" className="adm-btn adm-btn--primary" onClick={createUser} disabled={busy || otp.length !== OTP_LENGTH}>
                {busy ? <><RefreshCw size={14} className="adm-spin" /> Creating…</> : <><Check size={15} /> Verify &amp; create</>}
              </button>
            )}
          </div>
        </footer>
      </motion.aside>

      <ConfirmDialog
        open={confirmClose}
        danger={false}
        title="Discard your changes?"
        message="This panel has edits that have not been saved. Closing it will lose them."
        confirmText="Discard"
        cancelText="Keep editing"
        onConfirm={() => { setConfirmClose(false); onClose(); }}
        onCancel={() => setConfirmClose(false)}
      />
    </>
  );
}

/* ═══════════════════════════ Labour workers ═══════════════════════════ */

function WorkersPanel({ workers, loading, onRefresh }) {
  const { showToast } = useToast() || {};
  const [form, setForm] = useState({ name: '', username: '', password: '', godown: 'kosli' });
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [delTarget, setDelTarget] = useState(null);
  const [showPass, setShowPass] = useState(false);
  const [query, setQuery] = useState('');

  const reset = () => { setForm({ name: '', username: '', password: '', godown: 'kosli' }); setEditing(null); setError(''); };

  const submit = async (e) => {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      if (editing) {
        const payload = { name: form.name.trim(), godown: form.godown };
        if (form.password) payload.password = form.password;
        await ax.patch(`/labour/workers/${editing.id}`, payload);
        showToast?.(`${form.name.trim()} updated`, 'success');
      } else {
        await ax.post('/labour/workers', { ...form, name: form.name.trim(), username: form.username.trim() });
        showToast?.(`${form.name.trim()} can now sign in to the labour portal`, 'success');
      }
      reset();
      onRefresh();
    } catch (err) {
      const msg = errorText(err, 'Could not save the worker');
      setError(msg);
      showToast?.(msg, 'error');
    } finally { setBusy(false); }
  };

  const remove = async () => {
    try {
      await ax.delete(`/labour/workers/${delTarget.id}`);
      showToast?.(`${delTarget.name} removed`, 'success');
      setDelTarget(null);
      onRefresh();
    } catch (err) {
      showToast?.(errorText(err, 'Could not remove the worker'), 'error');
      setDelTarget(null);
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return workers;
    return workers.filter(w => `${w.name} ${w.username} ${GODOWN[w.godown]?.label || w.godown}`.toLowerCase().includes(q));
  }, [workers, query]);

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 380px) 1fr', gap: 20, alignItems: 'start' }} className="adm-workers-grid">
        <div className="adm-panel">
          <header className="adm-panel-hd">
            <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
              <span className="adm-icon-tile" style={{ background: 'rgba(16,185,129,0.14)', color: '#10b981' }}>
                {editing ? <Pencil size={17} /> : <Plus size={17} />}
              </span>
              <div>
                <h2>{editing ? 'Edit worker' : 'Add a worker'}</h2>
                <p className="adm-sub">{editing ? `@${editing.username}` : 'Signs in to the labour portal only'}</p>
              </div>
            </div>
            {editing && (
              <button type="button" className="adm-btn adm-btn--ghost adm-btn--icon adm-btn--sm" onClick={reset} aria-label="Stop editing">
                <X size={16} />
              </button>
            )}
          </header>

          <form className="adm-panel-bd" onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Field label="Full name" required>
              <input className="adm-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ramu Kumar" required />
            </Field>

            <Field label="Username" required hint={editing ? 'Cannot be changed' : 'Lower-case, underscores instead of spaces'}>
              <input
                className="adm-input"
                value={form.username}
                disabled={!!editing}
                onChange={e => setForm(f => ({ ...f, username: e.target.value.toLowerCase().replace(/\s/g, '_') }))}
                placeholder="ramu_kosli"
                required
              />
            </Field>

            <Field label={editing ? 'New PIN or password' : 'PIN or password'} required={!editing} hint={editing ? 'Leave blank to keep the current one' : undefined}>
              <div className="adm-input-wrap">
                <input
                  className="adm-input"
                  type={showPass ? 'text' : 'password'}
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  placeholder={editing ? 'Unchanged' : '4-digit PIN or a password'}
                  required={!editing}
                  aria-label={editing ? 'New PIN or password' : 'PIN or password'}
                />
                <span className="adm-input-actions">
                  <button type="button" className="adm-input-btn" onClick={() => setShowPass(s => !s)} aria-label={showPass ? 'Hide' : 'Show'}>
                    {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </span>
              </div>
            </Field>

            <Field label="Assigned godown" required>
              <select className="adm-select" value={form.godown} onChange={e => setForm(f => ({ ...f, godown: e.target.value }))}>
                {GODOWNS.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
              </select>
            </Field>

            {error && <span className="adm-error"><AlertTriangle size={13} /> {error}</span>}

            <button type="submit" className="adm-btn adm-btn--primary adm-btn--block" disabled={busy}>
              {busy ? <><RefreshCw size={14} className="adm-spin" /> Saving…</> : editing ? <><Check size={15} /> Update worker</> : <><Plus size={15} /> Add worker</>}
            </button>
          </form>
        </div>

        <div className="adm-panel">
          <header className="adm-panel-hd">
            <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
              <span className="adm-icon-tile" style={{ background: 'rgba(16,185,129,0.14)', color: '#10b981' }}><HardHat size={18} /></span>
              <div>
                <h2>Registered workers</h2>
                <p className="adm-sub">{workers.length} account{workers.length === 1 ? '' : 's'} on the loading portal</p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div className="adm-search" style={{ minWidth: 160 }}>
                <Search size={14} />
                <input className="adm-input" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search workers…" aria-label="Search workers" />
              </div>
              <a href="/labour" target="_blank" rel="noopener noreferrer" className="adm-btn adm-btn--sm" style={{ textDecoration: 'none' }}>
                <ExternalLink size={13} /> Portal
              </a>
            </div>
          </header>

          <div className="adm-panel-bd adm-panel-bd--flush">
            {loading ? (
              <div className="adm-rows">{[0, 1, 2].map(i => <RowSkeleton key={i} />)}</div>
            ) : filtered.length === 0 ? (
              <div className="adm-empty">
                <span className="adm-empty-icon">{query ? <SearchX size={22} /> : <HardHat size={22} />}</span>
                <h3>{query ? 'No workers match' : 'No workers yet'}</h3>
                <p>{query ? `Nothing matches “${query.trim()}”.` : 'Add a worker on the left so loading status can be updated from the yard.'}</p>
              </div>
            ) : (
              <div className="adm-rows">
                {filtered.map(w => {
                  const g = GODOWN[w.godown] || { label: w.godown, color: '#6366f1' };
                  return (
                    <div key={w.id} className="adm-row" style={{ cursor: 'default', gridTemplateColumns: 'minmax(0,2fr) minmax(0,1fr) auto' }}>
                      <div className="adm-row-main">
                        <Avatar name={w.name} color={g.color} />
                        <div style={{ minWidth: 0 }}>
                          <div className="adm-row-name">{w.name}</div>
                          <div className="adm-row-sub">@{w.username}</div>
                        </div>
                      </div>
                      <div><span className="adm-chip" style={{ background: `${g.color}22`, color: g.color }}>{g.label}</span></div>
                      <div className="adm-row-actions">
                        <button type="button" className="adm-btn adm-btn--ghost adm-btn--icon adm-btn--sm" onClick={() => { setEditing(w); setForm({ name: w.name, username: w.username, password: '', godown: w.godown }); }} title="Edit worker">
                          <Pencil size={14} />
                        </button>
                        <button type="button" className="adm-btn adm-btn--ghost adm-btn--icon adm-btn--sm" style={{ color: 'var(--danger)' }} onClick={() => setDelTarget(w)} title="Remove worker">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={!!delTarget}
        title="Remove this worker?"
        message={<><strong style={{ color: 'var(--text)' }}>{delTarget?.name}</strong> (@{delTarget?.username}) will lose access to the labour portal immediately.</>}
        confirmText="Remove worker"
        danger
        onConfirm={remove}
        onCancel={() => setDelTarget(null)}
      />

      <style>{'@media (max-width: 1000px) { .adm-workers-grid { grid-template-columns: 1fr !important; } }'}</style>
    </>
  );
}

/* ═══════════════════════════ Screen ═══════════════════════════ */

export default function AdminUserManagement() {
  const { user: me } = useAuth();
  const { showToast } = useToast() || {};

  const [tab, setTab] = useState('users');
  const [users, setUsers] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [workersLoading, setWorkersLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [selected, setSelected] = useState(() => new Set());
  const [drawer, setDrawer] = useState(null); // { mode, target }
  const [delTarget, setDelTarget] = useState(null);
  const [bulkDelete, setBulkDelete] = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoading(true); setLoadError('');
    try {
      const res = await ax.get(API);
      setUsers(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      setLoadError(errorText(err, 'Could not load the user directory'));
    } finally { setLoading(false); }
  }, []);

  const fetchWorkers = useCallback(async () => {
    setWorkersLoading(true);
    try {
      const res = await ax.get('/labour/workers');
      setWorkers(Array.isArray(res.data) ? res.data : []);
    } catch { /* the workers panel shows its own empty state */ }
    finally { setWorkersLoading(false); }
  }, []);

  useEffect(() => { fetchUsers(); fetchWorkers(); }, [fetchUsers, fetchWorkers]);

  const counts = useMemo(() => ({
    all: users.length,
    admin: users.filter(u => u.role === 'admin').length,
    user: users.filter(u => u.role !== 'admin').length,
    twoFactor: users.filter(u => u.isOtpEnabled).length,
  }), [users]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter(u => {
      if (roleFilter === 'admin' && u.role !== 'admin') return false;
      if (roleFilter === 'user' && u.role === 'admin') return false;
      if (!q) return true;
      return `${u.name || ''} ${u.username || ''} ${u.email || ''} ${u.role || ''}`.toLowerCase().includes(q);
    });
  }, [users, query, roleFilter]);

  // Deleting yourself is refused by the guard below, so it never counts here.
  const selectable = filtered.filter(u => u.id !== me?.id);
  // Filtered against `users` so ids left over from a deleted account drop out
  // on the next fetch, and against `me` so no path can queue self-deletion.
  const selectedList = users.filter(u => selected.has(u.id) && u.id !== me?.id);
  const allSelected = selectable.length > 0 && selectable.every(u => selected.has(u.id));
  const someSelected = selectable.some(u => selected.has(u.id));

  const toggleAll = (on) => {
    setSelected(prev => {
      const next = new Set(prev);
      selectable.forEach(u => (on ? next.add(u.id) : next.delete(u.id)));
      return next;
    });
  };

  const toggleOne = (id, on) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (on) next.add(id); else next.delete(id);
      return next;
    });
  };

  const deleteUser = async () => {
    try {
      await ax.delete(`${API}/${delTarget.id}`);
      showToast?.(`${delTarget.name} deleted`, 'success');
      setSelected(prev => { const n = new Set(prev); n.delete(delTarget.id); return n; });
      setDelTarget(null);
      fetchUsers();
    } catch (err) {
      showToast?.(errorText(err, 'Delete failed'), 'error');
      setDelTarget(null);
    }
  };

  const deleteSelected = async () => {
    const results = await Promise.allSettled(selectedList.map(u => ax.delete(`${API}/${u.id}`)));
    const failed = results.filter(r => r.status === 'rejected').length;
    if (failed) showToast?.(`${selectedList.length - failed} deleted, ${failed} failed`, failed === selectedList.length ? 'error' : 'warning');
    else showToast?.(`${selectedList.length} account${selectedList.length === 1 ? '' : 's'} deleted`, 'success');
    setSelected(new Set());
    setBulkDelete(false);
    fetchUsers();
  };

  const lastAdminOf = (u) => u.role === 'admin' && counts.admin <= 1;

  const closeDrawer = () => setDrawer(null);
  const onSaved = () => { setDrawer(null); fetchUsers(); };

  return (
    <div className="adm adm-page">
      <header className="adm-head">
        <div>
          <h1><Users size={22} color="var(--primary)" /> User management</h1>
          <p>Create accounts, set what each one can reach, and manage the labour portal logins.</p>
        </div>
        <div className="adm-head-actions">
          <button type="button" className="adm-btn adm-btn--icon" onClick={() => { fetchUsers(); fetchWorkers(); }} title="Reload" aria-label="Reload">
            <RefreshCw size={15} className={loading ? 'adm-spin' : ''} />
          </button>
          {tab === 'users' && (
            <button type="button" className="adm-btn adm-btn--primary" onClick={() => setDrawer({ mode: 'create' })}>
              <Plus size={15} /> Add user
            </button>
          )}
        </div>
      </header>

      <div className="adm-stats">
        <div className="adm-stat">
          <span className="adm-icon-tile"><Users size={18} /></span>
          <div><div className="adm-stat-value">{counts.all}</div><div className="adm-stat-label">Accounts</div></div>
        </div>
        <div className="adm-stat">
          <span className="adm-icon-tile" style={{ background: 'rgba(239,68,68,0.14)', color: '#ef4444' }}><Crown size={18} /></span>
          <div><div className="adm-stat-value">{counts.admin}</div><div className="adm-stat-label">Administrators</div></div>
        </div>
        <div className="adm-stat">
          <span className="adm-icon-tile" style={{ background: 'rgba(16,185,129,0.14)', color: '#10b981' }}><ShieldCheck size={18} /></span>
          <div><div className="adm-stat-value">{counts.twoFactor}</div><div className="adm-stat-label">Two-factor on</div></div>
        </div>
        <div className="adm-stat">
          <span className="adm-icon-tile" style={{ background: 'rgba(245,158,11,0.14)', color: '#f59e0b' }}><Truck size={18} /></span>
          <div><div className="adm-stat-value">{workers.length}</div><div className="adm-stat-label">Labour workers</div></div>
        </div>
      </div>

      <div className="adm-tabs" role="tablist" aria-label="User management sections">
        <button type="button" role="tab" aria-selected={tab === 'users'} className="adm-tab" onClick={() => setTab('users')}>
          <Users size={15} /> System users <span className="adm-tab-count">{counts.all}</span>
        </button>
        <button type="button" role="tab" aria-selected={tab === 'workers'} className="adm-tab" onClick={() => setTab('workers')}>
          <HardHat size={15} /> Labour workers <span className="adm-tab-count">{workers.length}</span>
        </button>
      </div>

      {tab === 'workers' ? (
        <WorkersPanel workers={workers} loading={workersLoading} onRefresh={fetchWorkers} />
      ) : (
        <div className="adm-panel">
          <header className="adm-panel-hd">
            <div className="adm-search" style={{ maxWidth: 340 }}>
              <Search size={14} />
              <input
                className="adm-input"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search by name, username, email or role…"
                aria-label="Search users"
              />
            </div>
            <div className="adm-tabs adm-tabs--plain" role="tablist" aria-label="Filter by role">
              {[
                { id: 'all', label: 'All users', n: counts.all },
                { id: 'admin', label: 'Administrators', n: counts.admin },
                { id: 'user', label: 'Users', n: counts.user },
              ].map(f => (
                <button
                  key={f.id}
                  type="button"
                  role="tab"
                  aria-selected={roleFilter === f.id}
                  className="adm-tab"
                  onClick={() => setRoleFilter(f.id)}
                >
                  {f.label} <span className="adm-tab-count">{f.n}</span>
                </button>
              ))}
            </div>
          </header>

          {loadError && (
            <div style={{ padding: '14px 20px' }}>
              <div className="adm-note adm-note--danger">
                <AlertTriangle size={16} />
                <span style={{ flex: 1 }}>{loadError}</span>
                <button type="button" className="adm-link adm-link--accent" onClick={fetchUsers}>Retry</button>
              </div>
            </div>
          )}

          <div className="adm-row-hd">
            <Checkbox checked={allSelected} mixed={!allSelected && someSelected} onChange={toggleAll} label="Select all users" />
            <span>User</span>
            <span className="adm-col-hide">Role</span>
            <span className="adm-col-hide">Access</span>
            <span>Actions</span>
          </div>

          {loading ? (
            <div className="adm-rows">{[0, 1, 2, 3].map(i => <RowSkeleton key={i} />)}</div>
          ) : filtered.length === 0 ? (
            <div className="adm-empty">
              <span className="adm-empty-icon">{query || roleFilter !== 'all' ? <SearchX size={22} /> : <Users size={22} />}</span>
              <h3>{query || roleFilter !== 'all' ? 'No accounts match' : 'No accounts yet'}</h3>
              <p>
                {query || roleFilter !== 'all'
                  ? 'Try a different search, or clear the role filter.'
                  : 'Create the first account to give someone access to the system.'}
              </p>
              {query || roleFilter !== 'all'
                ? <button type="button" className="adm-btn adm-btn--sm" onClick={() => { setQuery(''); setRoleFilter('all'); }}>Clear filters</button>
                : <button type="button" className="adm-btn adm-btn--primary adm-btn--sm" onClick={() => setDrawer({ mode: 'create' })}><Plus size={14} /> Add user</button>}
            </div>
          ) : (
            <div className="adm-rows">
              {filtered.map(u => {
                const isMe = u.id === me?.id;
                const color = ROLE_COLOR[u.role] || '#6366f1';
                const access = accessSummary(u);
                const open = drawer?.mode === 'edit' && drawer.target?.id === u.id;
                return (
                  <div
                    key={u.id}
                    className="adm-row"
                    role="button"
                    tabIndex={0}
                    data-active={open ? 'true' : 'false'}
                    onClick={() => setDrawer({ mode: 'edit', target: u })}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setDrawer({ mode: 'edit', target: u }); } }}
                  >
                    {/* No checkbox for your own row: the bulk action is delete,
                        and deleting the account you are signed in with is not
                        something to offer behind a select-all. */}
                    {isMe ? <span aria-hidden="true" /> : (
                      <Checkbox
                        checked={selected.has(u.id)}
                        onChange={on => toggleOne(u.id, on)}
                        label={`Select ${u.name}`}
                      />
                    )}

                    <div className="adm-row-main">
                      <Avatar name={u.name} color={color} />
                      <div style={{ minWidth: 0 }}>
                        <div className="adm-row-name">
                          {u.name}
                          {isMe && <span className="adm-chip adm-chip--info">You</span>}
                        </div>
                        <div className="adm-row-sub">@{u.username}{u.email ? ` · ${u.email}` : ' · no email'}</div>
                      </div>
                    </div>

                    <div className="adm-col-hide" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <span className="adm-chip" style={{ background: `${color}22`, color }}>
                        {u.role === 'admin' ? <Crown size={11} /> : <Users size={11} />}
                        {u.role === 'admin' ? 'Admin' : 'User'}
                      </span>
                      {u.isOtpEnabled && (
                        <span className="adm-chip adm-chip--success" title="Two-factor at login is on"><ShieldCheck size={11} /> 2FA</span>
                      )}
                    </div>

                    <div className="adm-col-hide">
                      <span className={`adm-chip adm-chip--${access.tone}`}>{access.text}</span>
                    </div>

                    <div className="adm-row-actions">
                      <button
                        type="button"
                        className="adm-btn adm-btn--ghost adm-btn--icon adm-btn--sm"
                        onClick={e => { e.stopPropagation(); setDrawer({ mode: 'edit', target: u }); }}
                        title="Edit account and permissions"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        className="adm-btn adm-btn--ghost adm-btn--icon adm-btn--sm"
                        style={{ color: isMe || lastAdminOf(u) ? 'var(--text-muted)' : 'var(--danger)' }}
                        disabled={isMe || lastAdminOf(u)}
                        onClick={e => { e.stopPropagation(); setDelTarget(u); }}
                        title={isMe ? 'You cannot delete your own account' : lastAdminOf(u) ? 'The last administrator cannot be deleted' : 'Delete account'}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {selectedList.length > 0 && (
            <div className="adm-bulkbar">
              <span className="adm-bulkbar-text">
                {selectedList.length} account{selectedList.length === 1 ? '' : 's'} selected
              </span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="adm-btn adm-btn--sm" onClick={() => setSelected(new Set())}>Clear selection</button>
                <button
                  type="button"
                  className="adm-btn adm-btn--sm adm-btn--danger"
                  onClick={() => setBulkDelete(true)}
                  disabled={selectedList.some(lastAdminOf)}
                  title={selectedList.some(lastAdminOf) ? 'The selection includes the last administrator' : undefined}
                >
                  <Trash2 size={14} /> Delete selected
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <AnimatePresence>
        {drawer && (
          <UserDrawer
            key={drawer.mode === 'edit' ? `edit-${drawer.target.id}` : 'create'}
            mode={drawer.mode}
            target={drawer.target}
            users={users}
            me={me}
            onClose={closeDrawer}
            onSaved={onSaved}
          />
        )}
      </AnimatePresence>

      <ConfirmDialog
        open={!!delTarget}
        title="Delete this account?"
        message={<><strong style={{ color: 'var(--text)' }}>{delTarget?.name}</strong> (@{delTarget?.username}) will be removed permanently and will not be able to sign in again.</>}
        confirmText="Delete account"
        danger
        onConfirm={deleteUser}
        onCancel={() => setDelTarget(null)}
      />

      <ConfirmDialog
        open={bulkDelete}
        title={`Delete ${selectedList.length} account${selectedList.length === 1 ? '' : 's'}?`}
        message={<>{selectedList.map(u => u.name).join(', ')} will be removed permanently. This cannot be undone.</>}
        confirmText="Delete all selected"
        danger
        onConfirm={deleteSelected}
        onCancel={() => setBulkDelete(false)}
      />
    </div>
  );
}
