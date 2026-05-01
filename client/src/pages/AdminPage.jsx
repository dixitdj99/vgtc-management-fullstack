import React, { useState, useEffect } from 'react';
import ax from '../api';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Plus, Trash2, User, Lock, AlertTriangle, X, Check, RefreshCw, Crown, Users, Truck, Eye, EyeOff, ExternalLink } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';

const API = `/users`;
const ROLES = ['user', 'admin'];
const ROLE_COLOR = { admin: '#6366f1', user: '#10b981' };
const ROLE_ICON = { admin: Crown, user: Users };

const MODULES = [
  // Kosli
  { key: 'lr_kosli', label: 'Kosli LR' },
  { key: 'bill_kosli', label: 'Kosli Bill' },
  { key: 'balance_kosli', label: 'Balance - Kosli' },
  { key: 'stock_kosli', label: 'Kosli Stock' },
  // Jhajjar
  { key: 'lr_jhajjar', label: 'Jhajjar LR' },
  { key: 'bill_jhajjar', label: 'Jhajjar Bill' },
  { key: 'balance_jhajjar', label: 'Balance - Jhajjar' },
  { key: 'stock_jhajjar', label: 'Jhajjar Stock' },
  // JK Lakshmi (Jharli)
  { key: 'lr_jkl', label: 'JK Lakshmi LR' },
  { key: 'voucher_jkl_dump', label: 'JKL Dump Voucher' },
  { key: 'voucher_jkl', label: 'JK Lakshmi Voucher' },
  { key: 'balance_jkl_dump', label: 'Balance - JKL Dump' },
  { key: 'balance_jkl', label: 'Balance - JK Lakshmi' },
  { key: 'stock_jkl', label: 'JK Lakshmi Stock' },
  // JK Super (Jharli)
  { key: 'voucher_jksuper', label: 'JK Super Voucher' },
  { key: 'balance_jksuper', label: 'Balance - JK Super' },
  // Shared / Utilities
  { key: 'cashbook', label: 'Cashbook' },
  { key: 'pay', label: 'Pay Vehicles' },
  { key: 'invoice', label: 'Generate Invoice' },
  { key: 'vehicle', label: 'Vehicle Management' },
  { key: 'diesel', label: 'Diesel Module' },
  { key: 'mileage', label: 'Mileage Tracker' },
  { key: 'sell', label: 'Sell Management' },
  { key: 'loading_status', label: 'Loading Realtime' },
];

// Location-based permission hierarchy
const HIERARCHY = [
  {
    id: 'jharli',
    label: 'Jharli Dump & Plant',
    color: '#f59e0b',
    groups: [
      {
        id: 'jkl_dump',
        label: 'JK Lakshmi Dump',
        modules: ['voucher_jkl_dump', 'balance_jkl_dump', 'stock_jkl', 'sell', 'loading_status'],
      },
      {
        id: 'jkl_factory',
        label: 'JK Lakshmi Factory',
        modules: ['lr_jkl', 'voucher_jkl', 'balance_jkl'],
      },
      {
        id: 'jksuper_factory',
        label: 'JK Super Factory',
        modules: ['voucher_jksuper', 'balance_jksuper'],
      },
      {
        id: 'jharli_shared',
        label: 'Shared Utilities',
        modules: ['cashbook', 'pay', 'invoice', 'vehicle', 'diesel', 'mileage'],
      },
    ],
    // Maps to internal: plant=jklakshmi
    plantKey: 'jklakshmi',
  },
  {
    id: 'kosli',
    label: 'Kosli Dump',
    color: '#6366f1',
    groups: [
      {
        id: 'kosli_plant',
        label: 'Kosli Plant Modules',
        modules: ['lr_kosli', 'bill_kosli', 'balance_kosli', 'stock_kosli'],
      },
      {
        id: 'kosli_shared',
        label: 'Shared Utilities',
        modules: ['cashbook', 'pay', 'invoice', 'vehicle', 'diesel', 'mileage', 'sell', 'loading_status'],
      },
    ],
    // Maps to internal: plant=jksuper, godown=kosli
    plantKey: 'jksuper',
    godownKey: 'kosli',
  },
  {
    id: 'jhajjar',
    label: 'Jajjhar Dump',
    color: '#14b8a6',
    groups: [
      {
        id: 'jhajjar_plant',
        label: 'Jhajjar Plant Modules',
        modules: ['lr_jhajjar', 'bill_jhajjar', 'balance_jhajjar', 'stock_jhajjar'],
      },
      {
        id: 'jhajjar_shared',
        label: 'Shared Utilities',
        modules: ['cashbook', 'pay', 'invoice', 'vehicle', 'diesel', 'mileage', 'sell', 'loading_status'],
      },
    ],
    // Maps to internal: plant=jksuper, godown=jhajjar
    plantKey: 'jksuper',
    godownKey: 'jhajjar',
  },
];

function DeleteConfirm({ u, onClose, onConfirm }) {
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try { await ax.delete(API + '/' + u.id); onConfirm(); }
    catch (e) { alert(e.response?.data?.error || 'Delete failed'); }
    finally { setBusy(false); }
  };
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)'
    }}>
      <motion.div initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
        style={{
          width: '90%', maxWidth: '340px', background: 'var(--bg-card)', border: '1px solid rgba(244,63,94,0.25)',
          borderRadius: '16px', padding: '28px 24px', textAlign: 'center'
        }}>
        <div style={{
          width: '52px', height: '52px', borderRadius: '14px', background: 'rgba(244,63,94,0.1)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px'
        }}>
          <AlertTriangle size={26} color="var(--danger)" />
        </div>
        <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text)', marginBottom: '8px' }}>Delete User?</div>
        <div style={{ fontSize: '12.5px', color: 'var(--text-sub)', marginBottom: '22px' }}>
          <strong style={{ color: 'var(--text)' }}>{u.name}</strong> (@{u.username}) will be permanently removed.
        </div>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
          <button className="btn btn-g" onClick={onClose}>Cancel</button>
          <button className="btn btn-d" onClick={go} disabled={busy}>
            {busy ? '...' : <><Trash2 size={13} /> Delete</>}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function UserRow({ u, i, RIcon, isMe, onEdit, onDelete }) {
  const [showPass, setShowPass] = useState(false);
  return (
    <tr style={{ background: i % 2 === 0 ? 'var(--bg-row-even)' : 'var(--bg-row-odd)' }}>
      <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-row)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '34px', height: '34px', borderRadius: '10px',
            background: ROLE_COLOR[u.role] + '20',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 900, fontSize: '14px', color: ROLE_COLOR[u.role]
          }}>
            {u.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <div style={{ fontWeight: 700, color: 'var(--text)', fontSize: '13px' }}>{u.name}</div>
            {isMe && <div style={{ fontSize: '9px', fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>You</div>}
          </div>
        </div>
      </td>
      <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-row)', color: 'var(--text-sub)', fontFamily: 'monospace', fontWeight: 600 }}>
        @{u.username}
      </td>
      <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-row)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontFamily: 'monospace', fontSize: '12px', fontWeight: 700, color: 'var(--text-sub)', letterSpacing: showPass ? 0 : '0.15em' }}>
            {u.plainPassword ? (showPass ? u.plainPassword : '•'.repeat(Math.min(u.plainPassword.length, 10))) : <span style={{ opacity: 0.3 }}>—</span>}
          </span>
          {u.plainPassword && (
            <button onClick={() => setShowPass(s => !s)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px', display: 'flex' }}>
              {showPass ? <EyeOff size={12} /> : <Eye size={12} />}
            </button>
          )}
        </div>
      </td>
      <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-row)', color: 'var(--text-sub)' }}>
        {u.email || <span style={{ opacity: 0.3 }}>—</span>}
      </td>
      <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-row)' }}>
        {u.isOtpEnabled ? <Check size={14} color="#10b981" /> : <X size={14} color="var(--text-muted)" style={{ opacity: 0.5 }} />}
      </td>
      <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-row)' }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: '5px',
          padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 700,
          background: ROLE_COLOR[u.role] + '18', color: ROLE_COLOR[u.role]
        }}>
          <RIcon size={11} /> {u.role.charAt(0).toUpperCase() + u.role.slice(1)}
        </span>
      </td>
      <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-row)' }}>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button className="btn btn-g btn-sm btn-icon" title="Edit user" onClick={onEdit}>
            <Users size={13} />
          </button>
          {!isMe && (
            <button className="btn btn-d btn-sm btn-icon" onClick={onDelete} title="Delete user">
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

export default function AdminPage() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [delTarget, setDelTarget] = useState(null);
  const [editTarget, setEditTarget] = useState(null);

  const [form, setForm] = useState({
    name: '', username: '', password: '', role: 'user',
    email: '', isOtpEnabled: false, permissions: {}
  });
  const [formError, setFormError] = useState('');

  useEffect(() => { fetchUsers(); fetchWorkers(); }, []);

  // ── Labour Workers ───────────────────────────────────────────
  const [workers, setWorkers] = useState([]);
  const [workerForm, setWorkerForm] = useState({ name: '', username: '', password: '', godown: 'kosli' });
  const [workerBusy, setWorkerBusy] = useState(false);
  const [workerError, setWorkerError] = useState('');
  const [showWorkerPass, setShowWorkerPass] = useState(false);

  const fetchWorkers = async () => {
    try { setWorkers((await ax.get('/labour/workers')).data); }
    catch { }
  };

  const handleCreateWorker = async e => {
    e.preventDefault(); setWorkerError(''); setWorkerBusy(true);
    try {
      await ax.post('/labour/workers', workerForm);
      setWorkerForm({ name: '', username: '', password: '', godown: 'kosli' });
      fetchWorkers();
    } catch (err) { setWorkerError(err.response?.data?.error || 'Failed to create worker'); }
    finally { setWorkerBusy(false); }
  };

  const handleDeleteWorker = async (id) => {
    if (!confirm('Delete this labour worker?')) return;
    try { await ax.delete(`/labour/workers/${id}`); fetchWorkers(); }
    catch { alert('Delete failed'); }
  };

  const GODOWN_LABEL = { kosli: 'Kosli Godown', jhajjar: 'Jhajjar Godown', jkl: 'JK Lakshmi', dump: 'Dump (JK Super General)' };
  const GODOWN_COLOR = { kosli: '#6366f1', jhajjar: '#f59e0b', jkl: '#10b981', dump: '#f43f5e' };

  const fetchUsers = async () => {
    setLoading(true);
    try { setUsers((await ax.get(API)).data); }
    catch { } finally { setLoading(false); }
  };

  const handleCreate = async e => {
    e.preventDefault(); setFormError(''); setBusy(true);
    try {
      await ax.post(API, form);
      setForm({ name: '', username: '', password: '', role: 'user', email: '', isOtpEnabled: false, permissions: {} });
      fetchUsers();
    } catch (e) { setFormError(e.response?.data?.error || 'Failed to create user'); }
    finally { setBusy(false); }
  };

  const handleUpdate = async (id, data) => {
    setBusy(true); setFormError('');
    try {
      await ax.patch(`${API}/${id}`, data);
      fetchUsers();
      setEditTarget(null);
      setForm({ name: '', username: '', password: '', role: 'user', email: '', isOtpEnabled: false, permissions: {} });
    } catch (e) { setFormError(e.response?.data?.error || 'Update failed'); }
    finally { setBusy(false); }
  };

  const S = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const SPerm = (mod, val) => setForm(f => ({
    ...f, permissions: { ...f.permissions, [mod]: val }
  }));

  const PermissionToggle = ({ moduleKey, current, onChange }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--bg-card)', padding: '6px 10px', borderRadius: '8px', border: '1px solid var(--border)', marginBottom: '4px' }}>
      <span style={{ flex: 1, fontSize: '11px', fontWeight: 600, color: 'var(--text-sub)' }}>
        {MODULES.find(m => m.key === moduleKey)?.label}
      </span>
      <div style={{ display: 'flex', gap: '4px' }}>
        {['None', 'View', 'Edit'].map(opt => {
          const val = opt === 'None' ? null : opt.toLowerCase();
          const isActive = current === val;
          return (
            <button key={opt} type="button" onClick={() => onChange(moduleKey, val)}
              style={{
                fontSize: '9px', fontWeight: 800, padding: '3px 6px', borderRadius: '4px',
                border: '1px solid', borderColor: isActive ? 'var(--accent)' : 'var(--border)',
                background: isActive ? 'var(--accent)20' : 'transparent',
                color: isActive ? 'var(--accent)' : 'var(--text-muted)',
                cursor: 'pointer', transition: 'all 0.15s'
              }}>
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );

  // Per-location allowed plants/godowns helpers
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
    // Update allowedPlants
    const currentPlants = form.permissions.allowedPlants || [];
    let nextPlants = checked
      ? (currentPlants.includes(loc.plantKey) ? currentPlants : [...currentPlants, loc.plantKey])
      : currentPlants.filter(p => {
          // Only remove if no other selected location uses the same plantKey
          const otherLocs = HIERARCHY.filter(h => h.id !== loc.id && isLocAllowed(h.id));
          return otherLocs.some(h => h.plantKey === p) || p !== loc.plantKey;
        });
    if (!checked) {
      // Simpler: just remove if no other active location with same plantKey
      const otherActiveWithSamePlant = HIERARCHY.filter(h => h.id !== loc.id && h.plantKey === loc.plantKey && isLocAllowed(h.id));
      if (otherActiveWithSamePlant.length === 0) {
        nextPlants = nextPlants.filter(p => p !== loc.plantKey);
      }
    }
    SPerm('allowedPlants', nextPlants);

    // Update allowedGodowns
    if (loc.godownKey) {
      const currentGodowns = form.permissions.allowedGodowns || [];
      const nextGodowns = checked
        ? (currentGodowns.includes(loc.godownKey) ? currentGodowns : [...currentGodowns, loc.godownKey])
        : currentGodowns.filter(g => g !== loc.godownKey);
      SPerm('allowedGodowns', nextGodowns);
    }
  };

  return (
    <>
      <AnimatePresence>
        {delTarget && <DeleteConfirm u={delTarget} onClose={() => setDelTarget(null)} onConfirm={() => { setDelTarget(null); fetchUsers(); }} />}
      </AnimatePresence>

      <div style={{ padding: '0 20px 40px' }}>
        <div className="page-hd">
          <div>
            <h1><Shield size={20} color="#6366f1" /> Admin Panel</h1>
            <p>User accounts & permissions</p>
          </div>
          <button className="btn btn-g btn-sm" onClick={fetchUsers}><RefreshCw size={14} className={loading ? 'ani-spin' : ''} /> Refresh</button>
        </div>

        <div className="two-col" style={{ display: 'grid', gridTemplateColumns: '400px 1fr', gap: '18px', alignItems: 'start' }}>

          {/* ── User Form (Create/Edit) ── */}
          <div className="card">
            <div className="card-header">
              <div className="card-title-block">
                <div className={`card-icon ${editTarget ? 'ci-amber' : 'ci-indigo'}`}>
                  {editTarget ? <Users size={17} /> : <Plus size={17} />}
                </div>
                <div className="card-title-text">
                  <h3>{editTarget ? 'Edit User' : 'Create User'}</h3>
                  <p>{editTarget ? `Modifying @${editTarget.username}` : 'Add a new account'}</p>
                </div>
              </div>
              {editTarget && (
                <button className="btn-icon" onClick={() => { setEditTarget(null); setForm({ name: '', username: '', password: '', role: 'user', email: '', isOtpEnabled: false, permissions: {} }); }} style={{ color: 'var(--text-muted)' }}>
                  <X size={16} />
                </button>
              )}
            </div>
            <div className="card-body">
              <form onSubmit={editTarget ? (e) => { e.preventDefault(); handleUpdate(editTarget.id, form); } : handleCreate}
                style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div className="field">
                  <label>Full Name</label>
                  <input className="fi" type="text" placeholder="Ramesh Kumar" value={form.name} onChange={e => S('name', e.target.value)} required />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div className="field">
                    <label><User size={11} /> Username</label>
                    <input className="fi" type="text" placeholder="ramesh" value={form.username} onChange={e => S('username', e.target.value.toLowerCase().replace(/\s/g, ''))} required disabled={!!editTarget} />
                  </div>
                  <div className="field">
                    <label><Lock size={11} /> {editTarget ? 'New Password' : 'Password'}</label>
                    <input className="fi" type="text" placeholder={editTarget ? 'Leave blank to keep' : 'e.g. pass@123'} value={form.password} onChange={e => S('password', e.target.value)} required={!editTarget} />
                  </div>
                </div>

                <div className="field">
                  <label>Email Address</label>
                  <input className="fi" type="email" placeholder="ramesh@gmail.com" value={form.email} onChange={e => S('email', e.target.value)} />
                </div>

                <div className="field">
                  <label>Role</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {ROLES.map(r => {
                      const RIcon = ROLE_ICON[r];
                      return (
                        <button key={r} type="button" onClick={() => S('role', r)}
                          style={{
                            flex: 1, padding: '9px 8px', borderRadius: '10px', border: '1px solid',
                            borderColor: form.role === r ? ROLE_COLOR[r] : 'var(--border)',
                            background: form.role === r ? ROLE_COLOR[r] + '18' : 'var(--bg-input)',
                            color: form.role === r ? ROLE_COLOR[r] : 'var(--text-muted)',
                            fontWeight: 700, fontSize: '12px', display: 'flex', alignItems: 'center',
                            justifyContent: 'center', gap: '6px', cursor: 'pointer', transition: 'all 0.15s',
                            fontFamily: 'inherit'
                          }}>
                          <RIcon size={13} />{r.charAt(0).toUpperCase() + r.slice(1)}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div style={{
                  marginTop: '4px', padding: '12px', borderRadius: '12px', border: '1px solid var(--border)',
                  background: form.isOtpEnabled ? 'rgba(99,102,241,0.05)' : 'transparent'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text)' }}>Email OTP Security</div>
                    <input type="checkbox" checked={form.isOtpEnabled} onChange={e => S('isOtpEnabled', e.target.checked)} style={{ cursor: 'pointer' }} />
                  </div>
                  <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                    Requires two-step verification using a code sent to the email above.
                  </div>
                </div>

                <div style={{ marginTop: '8px', padding: '12px', borderRadius: '12px', border: '1px solid var(--border)', background: 'rgba(0,0,0,0.05)' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '10px' }}>
                    Location & Module Access
                  </div>

                  {HIERARCHY.map(loc => {
                    const allowed = isLocAllowed(loc.id);
                    return (
                      <div key={loc.id} style={{ marginBottom: '14px', borderBottom: '1px solid var(--border)', paddingBottom: '10px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginBottom: '8px' }}>
                          <input type="checkbox" checked={allowed} onChange={e => toggleLocation(loc, e.target.checked)} />
                          <span style={{
                            display: 'flex', alignItems: 'center', gap: '6px',
                            fontSize: '13px', fontWeight: 800,
                            color: allowed ? loc.color : 'var(--text)'
                          }}>
                            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: loc.color, display: 'inline-block', flexShrink: 0 }} />
                            {loc.label}
                          </span>
                        </label>

                        {allowed && (
                          <div style={{ paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {loc.groups.map(grp => (
                              <div key={grp.id}>
                                <div style={{ fontSize: '9.5px', fontWeight: 800, color: loc.color, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px', opacity: 0.8 }}>
                                  {grp.label}
                                </div>
                                {grp.modules.map(mKey => (
                                  <PermissionToggle key={mKey} moduleKey={mKey} current={form.permissions[mKey]} onChange={SPerm} />
                                ))}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {formError && (
                  <div style={{
                    background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.2)',
                    borderRadius: '8px', padding: '8px 12px', fontSize: '12px', color: 'var(--danger)', fontWeight: 600
                  }}>
                    {formError}
                  </div>
                )}
                <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
                  {editTarget && (
                    <button type="button" className="btn btn-g" style={{ flex: 1 }} onClick={() => { setEditTarget(null); setForm({ name: '', username: '', password: '', role: 'user', email: '', isOtpEnabled: false, permissions: {} }); }}>Cancel</button>
                  )}
                  <button type="submit" className="btn btn-p" style={{ flex: 2, padding: '11px' }} disabled={busy}>
                    {busy ? 'Processing...' : (editTarget ? <><Check size={14} /> Update User</> : <><Plus size={14} /> Create User</>)}
                  </button>
                </div>
              </form>
            </div>
          </div>

          {/* ── Users Table ── */}
          <div className="card">
            <div className="card-header">
              <div className="card-title-block">
                <div className="card-icon" style={{ background: 'rgba(16,185,129,0.12)', color: '#10b981' }}><Users size={17} /></div>
                <div className="card-title-text"><h3>All Users</h3><p>{users.length} accounts</p></div>
              </div>
            </div>
            {loading ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>Loading...</div>
            ) : (
              <div className="tbl-wrap">
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-th)' }}>
                      {['User', 'Username', 'Password', 'Email', 'OTP', 'Role', 'Actions'].map(h => (
                        <th key={h} style={{
                          padding: '10px 16px', textAlign: 'left', fontSize: '10px',
                          fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase',
                          letterSpacing: '0.08em', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap'
                        }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u, i) => {
                      const RIcon = ROLE_ICON[u.role] || Users;
                      const isMe = u.id === me?.id;
                      return (
                        <UserRow key={u.id} u={u} i={i} RIcon={RIcon} isMe={isMe}
                          onEdit={() => {
                            setEditTarget(u);
                            setForm({
                              name: u.name, username: u.username, password: '', role: u.role,
                              email: u.email || '', isOtpEnabled: !!u.isOtpEnabled,
                              permissions: u.permissions || {}
                            });
                          }}
                          onDelete={() => setDelTarget(u)}
                        />
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── Labour Workers Section ─────────────────────────────── */}
          <div className="card" style={{ marginTop: '28px' }}>
            <div className="card-header" style={{ borderBottom: '1px solid var(--border)', marginBottom: '0' }}>
              <div className="card-title-block">
                <div className="card-icon" style={{ background: 'rgba(16,185,129,0.12)', color: '#10b981' }}><Truck size={17} /></div>
                <div className="card-title-text">
                  <h3>Labour Workers</h3>
                  <p>Workers who log in to the Labour Portal to update loading statuses</p>
                </div>
                <a href="/labour" target="_blank" rel="noopener noreferrer" className="btn btn-g btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '6px', textDecoration: 'none' }}>
                  <ExternalLink size={12} /> Open Labour Portal
                </a>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', padding: '20px' }}>
              {/* Create Worker Form */}
              <div>
                <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '14px' }}>Add New Worker</div>
                <form onSubmit={handleCreateWorker} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div className="field"><label><User size={10} /> Full Name</label><input className="fi" type="text" placeholder="e.g. Ramu Kumar" value={workerForm.name} onChange={e => setWorkerForm(f => ({ ...f, name: e.target.value }))} required /></div>
                  <div className="field"><label>Username (login ID)</label><input className="fi" type="text" placeholder="e.g. ramu_kosli" value={workerForm.username} onChange={e => setWorkerForm(f => ({ ...f, username: e.target.value.toLowerCase().replace(/\s/g, '_') }))} required /></div>
                  <div className="field">
                    <label><Lock size={10} /> Password / PIN</label>
                    <div style={{ position: 'relative' }}>
                      <input className="fi" type={showWorkerPass ? 'text' : 'password'} placeholder="Set a password or 4-digit PIN" value={workerForm.password} onChange={e => setWorkerForm(f => ({ ...f, password: e.target.value }))} required />
                      <button type="button" onClick={() => setShowWorkerPass(s => !s)} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                        {showWorkerPass ? <EyeOff size={13} /> : <Eye size={13} />}
                      </button>
                    </div>
                  </div>
                  <div className="field">
                    <label>Assigned Godown</label>
                    <select className="fi" value={workerForm.godown} onChange={e => setWorkerForm(f => ({ ...f, godown: e.target.value }))}>
                      <option value="kosli">Kosli Godown</option>
                      <option value="jhajjar">Jhajjar Godown</option>
                      <option value="jkl">JK Lakshmi</option>
                      <option value="dump">Dump — JK Super General</option>
                    </select>
                  </div>
                  {workerError && <div style={{ fontSize: '11px', color: 'var(--danger)', fontWeight: 600 }}>{workerError}</div>}
                  <button type="submit" className="btn btn-p btn-full" disabled={workerBusy}>
                    {workerBusy ? '...' : <><Plus size={13} /> Create Worker</>}
                  </button>
                </form>
              </div>

              {/* Worker List */}
              <div>
                <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '14px' }}>Registered Workers ({workers.length})</div>
                {workers.length === 0 ? (
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', padding: '20px', textAlign: 'center', border: '1px dashed var(--border)', borderRadius: '10px' }}>No workers yet. Add one to get started.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {workers.map(w => (
                      <div key={w.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '10px' }}>
                        <div style={{ width: '34px', height: '34px', borderRadius: '8px', background: `${GODOWN_COLOR[w.godown]}20`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Truck size={15} color={GODOWN_COLOR[w.godown] || '#6366f1'} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--text)' }}>{w.name}</div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>@{w.username} · <span style={{ color: GODOWN_COLOR[w.godown] || '#6366f1', fontWeight: 700 }}>{GODOWN_LABEL[w.godown] || w.godown}</span></div>
                        </div>
                        <button className="btn btn-d btn-sm btn-icon" onClick={() => handleDeleteWorker(w.id)} title="Remove worker"><Trash2 size={13} /></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

        </div>
      </div>
    </>
  );
}