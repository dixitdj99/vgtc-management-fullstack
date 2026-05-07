import React, { useState, useEffect } from 'react';
import ax from '../../api';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Plus, Trash2, User, Lock, AlertTriangle, X, Check, RefreshCw, Crown, Users, Truck, Eye, EyeOff, ExternalLink } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';

const API = `/users`;
const ROLES = ['user', 'admin'];
const ROLE_COLOR = { admin: '#8b5cf6', user: '#10b981' };
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
        <div style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginBottom: '22px' }}>
          <strong style={{ color: 'var(--text)' }}>{u.name}</strong> (@{u.username}) will be permanently removed.
        </div>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
          <button style={{
            padding: '10px 18px', borderRadius: '10px', border: '1px solid var(--border)', 
            background: 'rgba(255,255,255,0.05)', color: 'var(--text)', fontSize: '13px', fontWeight: 700, cursor: 'pointer'
          }} onClick={onClose}>Cancel</button>
          <button style={{
            padding: '10px 18px', borderRadius: '10px', border: 'none', 
            background: 'var(--danger)', color: 'white', fontSize: '13px', fontWeight: 700, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: '8px'
          }} onClick={go} disabled={busy}>
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
            {isMe && <div style={{ fontSize: '9px', fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>You</div>}
          </div>
        </div>
      </td>
      <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-row)', color: 'var(--text-muted)', fontFamily: 'monospace', fontWeight: 600 }}>
        @{u.username}
      </td>
      <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-row)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontFamily: 'monospace', fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: showPass ? 0 : '0.15em' }}>
            {u.plainPassword ? (showPass ? u.plainPassword : '•'.repeat(Math.min(u.plainPassword.length, 10))) : <span style={{ opacity: 0.3 }}>—</span>}
          </span>
          {u.plainPassword && (
            <button onClick={() => setShowPass(s => !s)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px', display: 'flex' }}>
              {showPass ? <EyeOff size={12} /> : <Eye size={12} />}
            </button>
          )}
        </div>
      </td>
      <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-row)', color: 'var(--text-muted)' }}>
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
          <button style={{ padding: '6px', borderRadius: '8px', border: '1px solid var(--border)', background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)', cursor: 'pointer' }} title="Edit user" onClick={onEdit}>
            <Users size={13} />
          </button>
          {!isMe && (
            <button style={{ padding: '6px', borderRadius: '8px', border: '1px solid rgba(244,63,94,0.2)', background: 'rgba(244,63,94,0.05)', color: 'var(--danger)', cursor: 'pointer' }} onClick={onDelete} title="Delete user">
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

export default function AdminUserManagement() {
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
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--bg-input)', padding: '6px 10px', borderRadius: '8px', border: '1px solid var(--border)', marginBottom: '4px' }}>
      <span style={{ flex: 1, fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>
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
                border: '1px solid', borderColor: isActive ? 'var(--primary)' : 'var(--border)',
                background: isActive ? 'rgba(139, 92, 246, 0.2)' : 'transparent',
                color: isActive ? 'var(--primary)' : 'var(--text-muted)',
                cursor: 'pointer', transition: 'all 0.15s'
              }}>
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );

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
      if (otherActiveWithSamePlant.length === 0) {
        nextPlants = nextPlants.filter(p => p !== loc.plantKey);
      }
    }
    SPerm('allowedPlants', nextPlants);

    if (loc.godownKey) {
      const currentGodowns = form.permissions.allowedGodowns || [];
      const nextGodowns = checked
        ? (currentGodowns.includes(loc.godownKey) ? currentGodowns : [...currentGodowns, loc.godownKey])
        : currentGodowns.filter(g => g !== loc.godownKey);
      SPerm('allowedGodowns', nextGodowns);
    }
  };

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
      <AnimatePresence>
        {delTarget && <DeleteConfirm u={delTarget} onClose={() => setDelTarget(null)} onConfirm={() => { setDelTarget(null); fetchUsers(); }} />}
      </AnimatePresence>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '32px' }}>
        
        {/* CREATE / EDIT COLUMN */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '24px', padding: '32px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '16px', background: editTarget ? 'rgba(245,158,11,0.1)' : 'rgba(139,92,246,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: editTarget ? '#f59e0b' : '#8b5cf6' }}>
                  {editTarget ? <Users size={24} /> : <Plus size={24} />}
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800 }}>{editTarget ? 'Modify Account' : 'Register User'}</h3>
                  <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-muted)' }}>{editTarget ? `Editing access for @${editTarget.username}` : 'Create a new system user'}</p>
                </div>
              </div>
              {editTarget && (
                <button onClick={() => { setEditTarget(null); setForm({ name: '', username: '', password: '', role: 'user', email: '', isOtpEnabled: false, permissions: {} }); }} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={20} /></button>
              )}
            </div>

            <form onSubmit={editTarget ? (e) => { e.preventDefault(); handleUpdate(editTarget.id, form); } : handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div className="field">
                <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '8px', display: 'block' }}>FULL NAME</label>
                <input style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '12px', padding: '12px 16px', color: 'var(--text)', fontSize: '14px', outline: 'none' }} type="text" placeholder="e.g. Rahul Sharma" value={form.name} onChange={e => S('name', e.target.value)} required />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="field">
                  <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '8px', display: 'block' }}>USERNAME</label>
                  <input style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '12px', padding: '12px 16px', color: 'var(--text)', fontSize: '14px', outline: 'none' }} type="text" placeholder="username" value={form.username} onChange={e => S('username', e.target.value.toLowerCase().replace(/\s/g, ''))} required disabled={!!editTarget} />
                </div>
                <div className="field">
                  <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '8px', display: 'block' }}>{editTarget ? 'NEW PASSWORD' : 'PASSWORD'}</label>
                  <input style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '12px', padding: '12px 16px', color: 'var(--text)', fontSize: '14px', outline: 'none' }} type="text" placeholder={editTarget ? 'Leave blank' : '••••••••'} value={form.password} onChange={e => S('password', e.target.value)} required={!editTarget} />
                </div>
              </div>

              <div className="field">
                <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '8px', display: 'block' }}>EMAIL ADDRESS</label>
                <input style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '12px', padding: '12px 16px', color: 'var(--text)', fontSize: '14px', outline: 'none' }} type="email" placeholder="user@vgtc.com" value={form.email} onChange={e => S('email', e.target.value)} />
              </div>

              <div className="field">
                <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '8px', display: 'block' }}>SYSTEM ROLE</label>
                <div style={{ display: 'flex', gap: '12px' }}>
                  {ROLES.map(r => {
                    const RIcon = ROLE_ICON[r];
                    const isActive = form.role === r;
                    return (
                      <button key={r} type="button" onClick={() => S('role', r)} style={{
                        flex: 1, padding: '12px', borderRadius: '12px', border: '1px solid',
                        borderColor: isActive ? ROLE_COLOR[r] : 'var(--border)',
                        background: isActive ? `${ROLE_COLOR[r]}15` : 'var(--bg-input)',
                        color: isActive ? ROLE_COLOR[r] : 'var(--text-muted)',
                        fontWeight: 800, fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', cursor: 'pointer', transition: 'all 0.2s'
                      }}>
                        <RIcon size={16} /> {r.toUpperCase()}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: '16px', padding: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 800 }}>Email OTP Verification</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Additional security layer for login</div>
                  </div>
                  <input type="checkbox" checked={form.isOtpEnabled} onChange={e => S('isOtpEnabled', e.target.checked)} style={{ width: '20px', height: '20px', cursor: 'pointer' }} />
                </div>
              </div>

              <div style={{ maxHeight: '400px', overflowY: 'auto', background: 'rgba(0,0,0,0.1)', border: '1px solid var(--border)', borderRadius: '16px', padding: '16px' }}>
                <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '16px' }}>ACCESS PERMISSIONS</div>
                {HIERARCHY.map(loc => {
                  const allowed = isLocAllowed(loc.id);
                  return (
                    <div key={loc.id} style={{ marginBottom: '20px', paddingBottom: '16px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', marginBottom: '12px' }}>
                        <input type="checkbox" checked={allowed} onChange={e => toggleLocation(loc, e.target.checked)} style={{ width: '16px', height: '16px' }} />
                        <span style={{ fontSize: '14px', fontWeight: 800, color: allowed ? loc.color : 'var(--text)' }}>{loc.label}</span>
                      </label>
                      {allowed && (
                        <div style={{ paddingLeft: '24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                          {loc.groups.map(grp => (
                            <div key={grp.id}>
                              <div style={{ fontSize: '10px', fontWeight: 800, color: loc.color, opacity: 0.6, marginBottom: '8px', textTransform: 'uppercase' }}>{grp.label}</div>
                              {grp.modules.map(mKey => (
                                <PermissionToggle key={mKey} moduleKey={mKey} current={form.permissions[mKey]} onChange={SPerm} />
                              ))}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              <button type="submit" disabled={busy} style={{
                width: '100%', padding: '16px', borderRadius: '16px', border: 'none',
                background: 'linear-gradient(135deg, var(--primary), #6366f1)',
                color: 'white', fontWeight: 800, fontSize: '15px', cursor: 'pointer',
                boxShadow: '0 8px 20px rgba(139, 92, 246, 0.3)', marginTop: '8px'
              }}>
                {busy ? 'Processing...' : (editTarget ? 'Update User Access' : 'Create User Account')}
              </button>
            </form>
          </div>

          {/* LABOUR WORKERS SECTION */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '24px', padding: '32px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '16px', background: 'rgba(16,185,129,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981' }}>
                <Truck size={24} />
              </div>
              <div style={{ flex: 1 }}>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800 }}>Labour Workers</h3>
                <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-muted)' }}>Staff who manage loading status via mobile portal</p>
              </div>
              <a href="/labour" target="_blank" style={{ color: 'var(--primary)', padding: '8px', borderRadius: '8px', background: 'rgba(139,92,246,0.1)', display: 'flex' }}><ExternalLink size={18} /></a>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
              <form onSubmit={handleCreateWorker} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <input style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '10px', padding: '10px 14px', color: 'var(--text)', fontSize: '13px', outline: 'none' }} placeholder="Full Name" value={workerForm.name} onChange={e => setWorkerForm(f => ({ ...f, name: e.target.value }))} required />
                <input style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '10px', padding: '10px 14px', color: 'var(--text)', fontSize: '13px', outline: 'none' }} placeholder="Username" value={workerForm.username} onChange={e => setWorkerForm(f => ({ ...f, username: e.target.value.toLowerCase().replace(/\s/g, '_') }))} required />
                <input style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '10px', padding: '10px 14px', color: 'var(--text)', fontSize: '13px', outline: 'none' }} type="password" placeholder="PIN / Password" value={workerForm.password} onChange={e => setWorkerForm(f => ({ ...f, password: e.target.value }))} required />
                <select style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '10px', padding: '10px 14px', color: 'var(--text)', fontSize: '13px', outline: 'none' }} value={workerForm.godown} onChange={e => setWorkerForm(f => ({ ...f, godown: e.target.value }))}>
                  <option value="kosli">Kosli Godown</option>
                  <option value="jhajjar">Jhajjar Godown</option>
                  <option value="jkl">JK Lakshmi</option>
                  <option value="dump">General Dump</option>
                </select>
                <button type="submit" disabled={workerBusy} style={{ padding: '12px', borderRadius: '10px', border: 'none', background: 'var(--primary)', color: 'white', fontWeight: 700, cursor: 'pointer' }}>Add Worker</button>
              </form>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '300px', overflowY: 'auto' }}>
                {workers.map(w => (
                  <div key={w.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: '12px' }}>
                    <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: `${GODOWN_COLOR[w.godown]}20`, color: GODOWN_COLOR[w.godown], display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Truck size={14} /></div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '13px', fontWeight: 700 }}>{w.name}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>@{w.username}</div>
                    </div>
                    <button onClick={() => handleDeleteWorker(w.id)} style={{ border: 'none', background: 'none', color: 'var(--danger)', cursor: 'pointer', padding: '4px' }}><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* USERS TABLE COLUMN */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '24px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '32px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800 }}>Registered Accounts</h3>
              <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-muted)' }}>{users.length} total users in system</p>
            </div>
            <button onClick={fetchUsers} style={{ padding: '8px 16px', borderRadius: '10px', border: '1px solid var(--border)', background: 'rgba(255,255,255,0.05)', color: 'var(--text)', fontSize: '13px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <RefreshCw size={14} className={loading ? 'ani-spin' : ''} /> Refresh
            </button>
          </div>

          <div style={{ flex: 1, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'rgba(0,0,0,0.2)' }}>
                  {['User', 'ID', 'Password', 'Email', 'OTP', 'Role', ''].map(h => (
                    <th key={h} style={{ padding: '16px', textAlign: 'left', fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', borderBottom: '1px solid var(--border)' }}>{h}</th>
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
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      onDelete={() => setDelTarget(u)}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}
