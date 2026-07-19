import React, { useState, useEffect, useMemo } from 'react';
import ax from '../../api';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Plus, Trash2, User, Lock, AlertTriangle, X, Check, RefreshCw, Crown, Users, Truck, Eye, EyeOff, ExternalLink, Search, Pencil, ChevronDown, ChevronUp, Mail, KeyRound } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';

const API = `/users`;
const DEFAULT_ROLES = ['admin', 'user'];
const ROLE_COLOR = { admin: '#ef4444', user: '#10b981', manager: '#f59e0b', viewer: '#6366f1', accountant: '#14b8a6' };
const ROLE_ICON = { admin: Crown, user: Users };

const MODULES = [
  { key: 'lr_kosli', label: 'Kosli LR' },
  { key: 'bill_kosli', label: 'Kosli Bill' },
  { key: 'balance_kosli', label: 'Balance - Kosli' },
  { key: 'stock_kosli', label: 'Kosli Stock' },
  { key: 'lr_jhajjar', label: 'Jhajjar LR' },
  { key: 'bill_jhajjar', label: 'Jhajjar Bill' },
  { key: 'balance_jhajjar', label: 'Balance - Jhajjar' },
  { key: 'stock_jhajjar', label: 'Jhajjar Stock' },
  { key: 'lr_bahadurgarh', label: 'Bahadurgarh LR' },
  { key: 'bill_bahadurgarh', label: 'Bahadurgarh Bill' },
  { key: 'balance_bahadurgarh', label: 'Balance - Bahadurgarh' },
  { key: 'stock_bahadurgarh', label: 'Bahadurgarh Stock' },
  { key: 'lr_jkl', label: 'JK Lakshmi LR' },
  { key: 'voucher_jkl_dump', label: 'JKL Dump Voucher' },
  { key: 'voucher_jkl', label: 'JK Lakshmi Voucher' },
  { key: 'balance_jkl_dump', label: 'Balance - JKL Dump' },
  { key: 'balance_jkl', label: 'Balance - JK Lakshmi' },
  { key: 'stock_jkl', label: 'JK Lakshmi Stock' },
  { key: 'voucher_jksuper', label: 'JK Super Voucher' },
  { key: 'balance_jksuper', label: 'Balance - JK Super' },
  { key: 'cashbook', label: 'Cashbook' },
  { key: 'pay', label: 'Pay Vehicles' },
  { key: 'invoice', label: 'Generate Invoice' },
  { key: 'vehicle', label: 'Vehicle Management' },
  { key: 'diesel', label: 'Diesel Module' },
  { key: 'mileage', label: 'Mileage Tracker' },
  { key: 'sell', label: 'Sell Management' },
  { key: 'loading_status', label: 'Loading Realtime' },
];

const HIERARCHY = [
  {
    id: 'jharli', label: 'Jharli Dump & Plant', color: '#f59e0b', plantKey: 'jklakshmi',
    groups: [
      { id: 'jkl_dump', label: 'JK Lakshmi Dump', modules: ['voucher_jkl_dump', 'balance_jkl_dump', 'stock_jkl', 'sell', 'loading_status'] },
      { id: 'jkl_factory', label: 'JK Lakshmi Factory', modules: ['lr_jkl', 'voucher_jkl', 'balance_jkl'] },
      { id: 'jksuper_factory', label: 'JK Super Factory', modules: ['voucher_jksuper', 'balance_jksuper'] },
      { id: 'jharli_shared', label: 'Shared Utilities', modules: ['cashbook', 'pay', 'invoice', 'vehicle', 'diesel', 'mileage'] },
    ],
  },
  {
    id: 'kosli', label: 'Kosli Dump', color: '#6366f1', plantKey: 'jksuper', godownKey: 'kosli',
    groups: [
      { id: 'kosli_plant', label: 'Kosli Plant Modules', modules: ['lr_kosli', 'bill_kosli', 'balance_kosli', 'stock_kosli'] },
      { id: 'kosli_shared', label: 'Shared Utilities', modules: ['cashbook', 'pay', 'invoice', 'vehicle', 'diesel', 'mileage', 'sell', 'loading_status'] },
    ],
  },
  {
    id: 'jhajjar', label: 'Jajjhar Dump', color: '#14b8a6', plantKey: 'jksuper', godownKey: 'jhajjar',
    groups: [
      { id: 'jhajjar_plant', label: 'Jhajjar Plant Modules', modules: ['lr_jhajjar', 'bill_jhajjar', 'balance_jhajjar', 'stock_jhajjar'] },
      { id: 'jhajjar_shared', label: 'Shared Utilities', modules: ['cashbook', 'pay', 'invoice', 'vehicle', 'diesel', 'mileage', 'sell', 'loading_status'] },
    ],
  },
  {
    id: 'bahadurgarh', label: 'Bahadurgarh Dump', color: '#d97706', plantKey: 'jksuper', godownKey: 'bahadurgarh',
    groups: [
      { id: 'bahadurgarh_plant', label: 'Bahadurgarh Plant Modules', modules: ['lr_bahadurgarh', 'bill_bahadurgarh', 'balance_bahadurgarh', 'stock_bahadurgarh'] },
      { id: 'bahadurgarh_shared', label: 'Shared Utilities', modules: ['cashbook', 'pay', 'invoice', 'vehicle', 'diesel', 'mileage', 'sell', 'loading_status'] },
    ],
  },
];

const GODOWN_LABEL = { kosli: 'Kosli', jhajjar: 'Jhajjar', bahadurgarh: 'Bahadurgarh', jkl: 'JK Lakshmi', dump: 'Dump' };
const GODOWN_COLOR = { kosli: '#6366f1', jhajjar: '#14b8a6', bahadurgarh: '#d97706', jkl: '#f59e0b', dump: '#f43f5e' };

// ── Reusable Components ──────────────────────────────────────

function CardHeader({ icon: Icon, title, subtitle, color = '#8b5cf6', right }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        <div style={{ width: '44px', height: '44px', borderRadius: '14px', background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', color }}><Icon size={22} /></div>
        <div>
          <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800 }}>{title}</h3>
          {subtitle && <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>{subtitle}</p>}
        </div>
      </div>
      {right}
    </div>
  );
}

function DeleteModal({ title, name, subtitle, onClose, onConfirm }) {
  const [busy, setBusy] = useState(false);
  const go = async () => { setBusy(true); try { await onConfirm(); } catch {} finally { setBusy(false); } };
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)' }}>
      <motion.div initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
        style={{ width: '90%', maxWidth: '340px', background: 'var(--bg-card)', border: '1px solid rgba(244,63,94,0.25)', borderRadius: '16px', padding: '28px 24px', textAlign: 'center' }}>
        <div style={{ width: '52px', height: '52px', borderRadius: '14px', background: 'rgba(244,63,94,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
          <AlertTriangle size={26} color="var(--danger)" />
        </div>
        <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text)', marginBottom: '8px' }}>{title}</div>
        <div style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginBottom: '22px' }}>
          <strong style={{ color: 'var(--text)' }}>{name}</strong> {subtitle}
        </div>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
          <button style={{ padding: '10px 18px', borderRadius: '10px', border: '1px solid var(--border)', background: 'rgba(255,255,255,0.05)', color: 'var(--text)', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }} onClick={onClose}>Cancel</button>
          <button style={{ padding: '10px 18px', borderRadius: '10px', border: 'none', background: 'var(--danger)', color: 'white', fontSize: '13px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }} onClick={go} disabled={busy}>
            {busy ? '...' : <><Trash2 size={13} /> Delete</>}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function PermissionToggle({ moduleKey, current, onChange }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--bg-input)', padding: '6px 10px', borderRadius: '8px', border: '1px solid var(--border)', marginBottom: '4px' }}>
      <span style={{ flex: 1, fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>
        {MODULES.find(m => m.key === moduleKey)?.label || GENERIC_MODULES.find(m => m.key === moduleKey)?.label || moduleKey}
      </span>
      <div style={{ display: 'flex', gap: '4px' }}>
        {['None', 'View', 'Edit'].map(opt => {
          const val = opt === 'None' ? null : opt.toLowerCase();
          const isActive = current === val;
          const c = opt === 'Edit' ? '#10b981' : opt === 'View' ? '#6366f1' : 'var(--text-muted)';
          return (
            <button key={opt} type="button" onClick={() => onChange(moduleKey, val)} style={{
              fontSize: '9px', fontWeight: 800, padding: '3px 7px', borderRadius: '5px', border: '1px solid',
              borderColor: isActive ? c : 'var(--border)', background: isActive ? `${c}20` : 'transparent',
              color: isActive ? c : 'var(--text-muted)', cursor: 'pointer', transition: 'all 0.15s'
            }}>{opt}</button>
          );
        })}
      </div>
    </div>
  );
}

function RoleBadge({ role }) {
  const c = ROLE_COLOR[role] || '#8b5cf6';
  const RIcon = ROLE_ICON[role] || Users;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, background: `${c}18`, color: c }}>
      <RIcon size={11} /> {role}
    </span>
  );
}

function PasswordCell({ plainPassword }) {
  const [show, setShow] = useState(false);
  if (!plainPassword) return <span style={{ opacity: 0.3, fontSize: '12px' }}>—</span>;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <span style={{ fontFamily: 'monospace', fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: show ? 0 : '0.15em' }}>
        {show ? plainPassword : '•'.repeat(Math.min(plainPassword.length, 10))}
      </span>
      <button onClick={() => setShow(s => !s)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px', display: 'flex' }}>
        {show ? <EyeOff size={12} /> : <Eye size={12} />}
      </button>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────

export default function AdminUserManagement() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [delTarget, setDelTarget] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [formError, setFormError] = useState('');
  const [otpMode, setOtpMode] = useState(false);
  const [methodId, setMethodId] = useState('');
  const [otpCode, setOtpCode] = useState('');

  const [form, setForm] = useState({ name: '', username: '', password: '', role: 'user', email: '', isOtpEnabled: false, permissions: {} });

  // Workers
  const [workers, setWorkers] = useState([]);
  const [workerForm, setWorkerForm] = useState({ name: '', username: '', password: '', godown: 'kosli' });
  const [workerBusy, setWorkerBusy] = useState(false);
  const [workerError, setWorkerError] = useState('');
  const [editWorker, setEditWorker] = useState(null);
  const [delWorker, setDelWorker] = useState(null);

  const orgRoles = DEFAULT_ROLES;

  // Permissions UI
  const [showPerms, setShowPerms] = useState(false);

  useEffect(() => { fetchUsers(); fetchWorkers(); }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try { setUsers((await ax.get(API)).data); } catch {} finally { setLoading(false); }
  };

  const fetchWorkers = async () => {
    try { setWorkers((await ax.get('/labour/workers')).data); } catch {}
  };

  // ── User CRUD ──────────────────────────────────────────

  const resetForm = () => {
    setForm({ name: '', username: '', password: '', role: 'user', email: '', isOtpEnabled: false, permissions: {} });
    setEditTarget(null);
    setShowPerms(false);
    setFormError('');
    setOtpMode(false);
    setMethodId('');
    setOtpCode('');
  };

  const handleSubmit = async e => {
    e.preventDefault();
    setFormError('');
    setBusy(true);
    try {
      if (editTarget) {
        const payload = { name: form.name, email: form.email, role: form.role, isOtpEnabled: form.isOtpEnabled, permissions: form.permissions };
        if (form.password) payload.password = form.password;
        await ax.patch(`${API}/${editTarget.id}`, payload);
        resetForm();
        fetchUsers();
      } else {
        if (!otpMode) {
          // Send OTP to email first
          const res = await ax.post(`${API}/send-otp`, { email: form.email });
          setMethodId(res.data.methodId);
          setOtpMode(true);
          setFormError('A verification OTP has been sent to the email address. Please enter it below to confirm.');
        } else {
          // Verify OTP and Create User
          await ax.post(API, {
            ...form,
            otpCode,
            methodId
          });
          resetForm();
          fetchUsers();
        }
      }
    } catch (err) {
      setFormError(err.response?.data?.error || 'Operation failed');
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (u) => {
    setEditTarget(u);
    setForm({ name: u.name, username: u.username, password: '', role: u.role, email: u.email || '', isOtpEnabled: !!u.isOtpEnabled, permissions: u.permissions || {} });
    setShowPerms(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async () => {
    try {
      await ax.delete(`${API}/${delTarget.id}`);
      setDelTarget(null);
      fetchUsers();
    } catch (e) {
      alert(e.response?.data?.error || 'Delete failed');
    }
  };

  // ── Worker CRUD ──────────────────────────────────────────

  const resetWorkerForm = () => {
    setWorkerForm({ name: '', username: '', password: '', godown: 'kosli' });
    setEditWorker(null);
    setWorkerError('');
  };

  const handleWorkerSubmit = async e => {
    e.preventDefault();
    setWorkerError('');
    setWorkerBusy(true);
    try {
      if (editWorker) {
        const payload = { name: workerForm.name, godown: workerForm.godown };
        if (workerForm.password) payload.password = workerForm.password;
        await ax.patch(`/labour/workers/${editWorker.id}`, payload);
      } else {
        await ax.post('/labour/workers', workerForm);
      }
      resetWorkerForm();
      fetchWorkers();
    } catch (err) {
      setWorkerError(err.response?.data?.error || 'Failed');
    } finally {
      setWorkerBusy(false);
    }
  };

  const startEditWorker = (w) => {
    setEditWorker(w);
    setWorkerForm({ name: w.name, username: w.username, password: '', godown: w.godown });
  };

  const handleDeleteWorker = async () => {
    try {
      await ax.delete(`/labour/workers/${delWorker.id}`);
      setDelWorker(null);
      fetchWorkers();
    } catch { alert('Delete failed'); }
  };

  // ── Permission Helpers ──────────────────────────────────

  const S = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const SPerm = (mod, val) => setForm(f => ({ ...f, permissions: { ...f.permissions, [mod]: val } }));

  const isLocAllowed = (locId) => {
    const loc = HIERARCHY.find(h => h.id === locId);
    if (!loc) return false;
    const allowedPlants = form.permissions.allowedPlants || [];
    if (!allowedPlants.includes(loc.plantKey)) return false;
    if (loc.godownKey) {
      const allowedGodowns = form.permissions.allowedGodowns || [];
      return allowedGodowns.includes(loc.godownKey);
    }
    return true;
  };

  const toggleLocation = (loc, checked) => {
    const currentPlants = form.permissions.allowedPlants || [];
    let nextPlants = checked
      ? (currentPlants.includes(loc.plantKey) ? currentPlants : [...currentPlants, loc.plantKey])
      : currentPlants.filter(p => {
          const otherLocs = HIERARCHY.filter(h => h.id !== loc.id && isLocAllowed(h.id));
          return otherLocs.some(h => h.plantKey === p) || p !== loc.plantKey;
        });
    if (!checked) {
      const otherActiveWithSamePlant = HIERARCHY.filter(h => h.id !== loc.id && h.plantKey === loc.plantKey && isLocAllowed(h.id));
      if (otherActiveWithSamePlant.length === 0) nextPlants = nextPlants.filter(p => p !== loc.plantKey);
    }
    SPerm('allowedPlants', nextPlants);
    if (loc.godownKey) {
      const currentGodowns = form.permissions.allowedGodowns || [];
      const nextGodowns = checked ? (currentGodowns.includes(loc.godownKey) ? currentGodowns : [...currentGodowns, loc.godownKey]) : currentGodowns.filter(g => g !== loc.godownKey);
      SPerm('allowedGodowns', nextGodowns);
    }
  };

  const handleRoleChange = (newRole) => {
    S('role', newRole);
  };

  // ── Filtered users ──────────────────────────────────────

  const filteredUsers = useMemo(() => {
    if (!searchQuery.trim()) return users;
    const q = searchQuery.toLowerCase();
    return users.filter(u => u.name?.toLowerCase().includes(q) || u.username?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q) || u.role?.toLowerCase().includes(q));
  }, [users, searchQuery]);

  // ── Render ──────────────────────────────────────────────

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
      <AnimatePresence>
        {delTarget && <DeleteModal title="Delete User?" name={delTarget.name} subtitle={`(@${delTarget.username}) will be permanently removed.`} onClose={() => setDelTarget(null)} onConfirm={handleDelete} />}
        {delWorker && <DeleteModal title="Delete Worker?" name={delWorker.name} subtitle={`(@${delWorker.username}) will lose access to loading portal.`} onClose={() => setDelWorker(null)} onConfirm={handleDeleteWorker} />}
      </AnimatePresence>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(380px, 480px) 1fr', gap: '24px', alignItems: 'start' }}>

        {/* ── LEFT: Forms Column ────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

          {/* User Create/Edit Card */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '20px', padding: '28px' }}>
            <CardHeader
              icon={editTarget ? Pencil : Plus}
              title={editTarget ? 'Edit User' : 'Create User'}
              subtitle={editTarget ? `Editing @${editTarget.username}` : 'Add a new system user account'}
              color={editTarget ? '#f59e0b' : '#8b5cf6'}
              right={editTarget && <button onClick={resetForm} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}><X size={18} /></button>}
            />

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="field">
                <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px', display: 'block' }}>Full Name</label>
                <input className="fi" value={form.name} onChange={e => S('name', e.target.value)} placeholder="e.g. Rahul Sharma" required disabled={otpMode && !editTarget} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="field">
                  <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px', display: 'block' }}>Username</label>
                  <input className="fi" value={form.username} onChange={e => S('username', e.target.value.toLowerCase().replace(/\s/g, ''))} placeholder="username" required disabled={!!editTarget || (otpMode && !editTarget)} />
                </div>
                <div className="field">
                  <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px', display: 'block' }}>{editTarget ? 'New Password' : 'Password'}</label>
                  <input className="fi" type="text" value={form.password} onChange={e => S('password', e.target.value)} placeholder={editTarget ? 'Leave blank to keep' : 'Password'} required={!editTarget} disabled={otpMode && !editTarget} />
                </div>
              </div>

              <div className="field">
                <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px', display: 'block' }}>Email</label>
                <input className="fi" type="email" value={form.email} onChange={e => S('email', e.target.value)} placeholder="user@company.com" required disabled={otpMode && !editTarget} />
              </div>

              {otpMode && !editTarget && (
                <div className="field">
                  <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px', display: 'block' }}>Verification OTP</label>
                  <input className="fi" value={otpCode} onChange={e => setOtpCode(e.target.value.trim())} placeholder="Enter 6-digit OTP code" required style={{ border: '1px solid var(--primary)', background: 'var(--bg-input)' }} />
                </div>
              )}

              {/* Role Selector */}
              <div className="field">
                <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px', display: 'block' }}>Role</label>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {orgRoles.map(r => {
                    const isActive = form.role === r;
                    const c = ROLE_COLOR[r] || '#8b5cf6';
                    return (
                      <button key={r} type="button" onClick={() => handleRoleChange(r)} disabled={otpMode && !editTarget} style={{
                        padding: '8px 14px', borderRadius: '10px', border: '1px solid',
                        borderColor: isActive ? c : 'var(--border)', background: isActive ? `${c}15` : 'var(--bg-input)',
                        color: isActive ? c : 'var(--text-muted)', fontWeight: 800, fontSize: '12px',
                        cursor: 'pointer', transition: 'all 0.15s', textTransform: 'capitalize'
                      }}>{r}</button>
                    );
                  })}
                </div>
              </div>


              {/* Permissions Accordion */}
              <div style={{ border: '1px solid var(--border)', borderRadius: '14px', overflow: 'hidden' }}>
                <button type="button" onClick={() => setShowPerms(p => !p)} style={{
                  width: '100%', padding: '14px 16px', background: 'var(--bg-input)', border: 'none', cursor: 'pointer',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text)'
                }}>
                  <span style={{ fontSize: '12px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Access Permissions</span>
                  {showPerms ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
                {showPerms && (
                  <div style={{ padding: '16px', maxHeight: '400px', overflowY: 'auto' }}>
                    {HIERARCHY.map(loc => {
                      const allowed = isLocAllowed(loc.id);
                      return (
                        <div key={loc.id} style={{ marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', marginBottom: '10px' }}>
                            <input type="checkbox" checked={allowed} onChange={e => toggleLocation(loc, e.target.checked)} style={{ width: '15px', height: '15px' }} />
                            <span style={{ fontSize: '13px', fontWeight: 800, color: allowed ? loc.color : 'var(--text-muted)' }}>{loc.label}</span>
                          </label>
                          {allowed && (
                            <div style={{ paddingLeft: '24px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                              {loc.groups.map(grp => (
                                <div key={grp.id}>
                                  <div style={{ fontSize: '10px', fontWeight: 800, color: loc.color, opacity: 0.6, marginBottom: '6px', textTransform: 'uppercase' }}>{grp.label}</div>
                                  {grp.modules.map(mKey => <PermissionToggle key={mKey} moduleKey={mKey} current={form.permissions[mKey]} onChange={SPerm} />)}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {formError && (
                <div style={{
                  padding: '10px 14px',
                  borderRadius: '10px',
                  fontSize: '12px',
                  fontWeight: 700,
                  background: formError.includes('verification OTP') ? 'rgba(16,185,129,0.1)' : 'rgba(244,63,94,0.1)',
                  color: formError.includes('verification OTP') ? '#10b981' : 'var(--danger)',
                  border: formError.includes('verification OTP') ? '1px solid rgba(16,185,129,0.2)' : '1px solid rgba(244,63,94,0.2)'
                }}>
                  {formError}
                </div>
              )}

              <button type="submit" disabled={busy} style={{
                width: '100%', padding: '14px', borderRadius: '14px', border: 'none',
                background: 'linear-gradient(135deg, var(--primary), #6366f1)', color: 'white',
                fontWeight: 800, fontSize: '14px', cursor: 'pointer', boxShadow: '0 6px 16px rgba(139,92,246,0.25)'
              }}>
                {busy ? <><RefreshCw size={14} className="ani-spin" /> Processing...</> : (editTarget ? 'Update User' : (otpMode ? 'Verify & Create User' : 'Send Verification OTP'))}
              </button>
            </form>
          </div>

          {/* Labour Workers Card */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '20px', padding: '28px' }}>
            <CardHeader
              icon={Truck}
              title="Labour Workers"
              subtitle={`${workers.length} workers for loading portal`}
              color="#10b981"
              right={<a href="/labour" target="_blank" style={{ color: 'var(--primary)', padding: '6px', borderRadius: '8px', background: 'rgba(139,92,246,0.1)', display: 'flex' }}><ExternalLink size={16} /></a>}
            />

            {/* Worker Create/Edit Form */}
            <form onSubmit={handleWorkerSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
              {editWorker && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderRadius: '8px', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)', fontSize: '12px', fontWeight: 700, color: '#f59e0b' }}>
                  Editing @{editWorker.username}
                  <button type="button" onClick={resetWorkerForm} style={{ background: 'none', border: 'none', color: '#f59e0b', cursor: 'pointer' }}><X size={14} /></button>
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <input className="fi" placeholder="Full Name" value={workerForm.name} onChange={e => setWorkerForm(f => ({ ...f, name: e.target.value }))} required />
                <input className="fi" placeholder="Username" value={workerForm.username} onChange={e => setWorkerForm(f => ({ ...f, username: e.target.value.toLowerCase().replace(/\s/g, '_') }))} required disabled={!!editWorker} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <input className="fi" type="text" placeholder={editWorker ? 'New PIN (blank = keep)' : 'PIN / Password'} value={workerForm.password} onChange={e => setWorkerForm(f => ({ ...f, password: e.target.value }))} required={!editWorker} />
                <select className="fi" value={workerForm.godown} onChange={e => setWorkerForm(f => ({ ...f, godown: e.target.value }))}>
                  {Object.entries(GODOWN_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              {workerError && <div style={{ fontSize: '11px', color: 'var(--danger)', fontWeight: 700 }}>{workerError}</div>}
              <button type="submit" disabled={workerBusy} className="btn btn-p" style={{ width: '100%' }}>
                {workerBusy ? <><RefreshCw size={13} className="ani-spin" /> Saving...</> : (editWorker ? <><Pencil size={13} /> Update Worker</> : <><Plus size={13} /> Add Worker</>)}
              </button>
            </form>

            {/* Workers List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '340px', overflowY: 'auto' }}>
              {workers.length === 0 && <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>No workers yet</div>}
              {workers.map(w => {
                const gc = GODOWN_COLOR[w.godown] || '#8b5cf6';
                return (
                  <div key={w.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '12px' }}>
                    <div style={{ width: '34px', height: '34px', borderRadius: '9px', background: `${gc}20`, color: gc, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '14px' }}>
                      {w.name?.charAt(0).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '13px', fontWeight: 700 }}>{w.name}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', gap: '8px', alignItems: 'center' }}>
                        @{w.username}
                        <span style={{ fontSize: '9px', fontWeight: 800, padding: '2px 6px', borderRadius: '4px', background: `${gc}18`, color: gc }}>{GODOWN_LABEL[w.godown] || w.godown}</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button onClick={() => startEditWorker(w)} style={{ border: 'none', background: 'none', color: '#8b5cf6', cursor: 'pointer', padding: '4px' }} title="Edit"><Pencil size={14} /></button>
                      <button onClick={() => setDelWorker(w)} style={{ border: 'none', background: 'none', color: 'var(--danger)', cursor: 'pointer', padding: '4px' }} title="Delete"><Trash2 size={14} /></button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── RIGHT: Users Table Column ──────────────────── */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '20px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '24px 28px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800 }}>Registered Accounts</h3>
              <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>{filteredUsers.length} of {users.length} users</p>
            </div>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <div style={{ position: 'relative' }}>
                <Search size={13} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input className="fi" placeholder="Search users..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} style={{ paddingLeft: '32px', width: '180px', height: '36px', fontSize: '12px' }} />
              </div>
              <button onClick={fetchUsers} style={{ padding: '8px 14px', borderRadius: '10px', border: '1px solid var(--border)', background: 'rgba(255,255,255,0.05)', color: 'var(--text)', fontSize: '12px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                <RefreshCw size={13} className={loading ? 'ani-spin' : ''} />
              </button>
            </div>
          </div>

          <div style={{ flex: 1, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'rgba(0,0,0,0.15)' }}>
                  {['User', 'Username', 'Password', 'Email', 'Role', ''].map(h => (
                    <th key={h} style={{ padding: '14px 16px', textAlign: 'left', fontSize: '10px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((u, i) => {
                  const isMe = u.id === me?.id;
                  const isEditing = editTarget?.id === u.id;
                  return (
                    <tr key={u.id} style={{ background: isEditing ? 'rgba(139,92,246,0.06)' : i % 2 === 0 ? 'var(--bg-row-even)' : 'var(--bg-row-odd)', transition: 'background 0.15s' }}>
                      <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-row)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div style={{ width: '34px', height: '34px', borderRadius: '10px', background: `${ROLE_COLOR[u.role] || '#8b5cf6'}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '14px', color: ROLE_COLOR[u.role] || '#8b5cf6' }}>
                            {u.name?.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: '13px' }}>{u.name}</div>
                            {isMe && <div style={{ fontSize: '9px', fontWeight: 800, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>You</div>}
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-row)', color: 'var(--text-muted)', fontFamily: 'monospace', fontWeight: 600, fontSize: '12px' }}>@{u.username}</td>
                      <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-row)' }}><PasswordCell plainPassword={u.plainPassword} /></td>
                      <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-row)', color: 'var(--text-muted)', fontSize: '12px' }}>{u.email || <span style={{ opacity: 0.3 }}>—</span>}</td>
                      <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-row)' }}><RoleBadge role={u.role} /></td>
                      <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-row)' }}>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button onClick={() => startEdit(u)} title="Edit" style={{ padding: '6px', borderRadius: '8px', border: '1px solid var(--border)', background: isEditing ? 'rgba(139,92,246,0.15)' : 'rgba(255,255,255,0.05)', color: isEditing ? '#8b5cf6' : 'var(--text-muted)', cursor: 'pointer' }}>
                            <Pencil size={13} />
                          </button>
                          {!isMe && (
                            <button onClick={() => setDelTarget(u)} title="Delete" style={{ padding: '6px', borderRadius: '8px', border: '1px solid rgba(244,63,94,0.2)', background: 'rgba(244,63,94,0.05)', color: 'var(--danger)', cursor: 'pointer' }}>
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filteredUsers.length === 0 && (
                  <tr><td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>{searchQuery ? 'No users match your search' : 'No users found'}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
