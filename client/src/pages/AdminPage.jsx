import React, { useState, useEffect } from 'react';
import ax from '../api';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Shield, Plus, Trash2, User, Lock, AlertTriangle, X, Check, RefreshCw, Crown,
  Users, Truck, Eye, EyeOff, ExternalLink, Fuel, Settings, Globe, Mail, Save, Building2, Server,
  BarChart3, TrendingUp, Cloud, LayoutDashboard, UserCircle, Briefcase
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import AdminDashboard from '../pages/admin/AdminDashboard';
import ProfitLossSheet from '../pages/admin/ProfitLossSheet';
import AdminModule from '../modules/AdminModule';
import StaffProfileModule from '../modules/StaffProfileModule';
import FuelStationManager from '../pages/admin/FuelStationManager';
import FirmManager from '../pages/admin/FirmManager';
import PartyMaster from '../modules/PartyMaster';
import PermissionEditor from '../components/PermissionEditor';

const API = `/users`;
const ROLES = ['user', 'admin'];
const ROLE_COLOR = { admin: '#6366f1', user: '#10b981' };
const ROLE_ICON = { admin: Crown, user: Users };

// MODULES and HIERARCHY used to be defined here and again in
// AdminUserManagement.jsx. The two copies had already drifted — attendance was
// missing from this one, lr_dump from both — so the list now lives in
// permissions/catalogue.js and the editor is shared.


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
  const [activeTab, setActiveTab] = useState('users'); // 'overview' | 'users' | 'workers' | 'fuel' | 'system' | 'pl_sheet' | 'backup'

  // Access Control Guard
  if (me?.role !== 'admin') {
    return (
      <div style={{ padding: '80px 20px', textAlign: 'center', maxWidth: '440px', margin: '0 auto' }}>
        <Shield size={54} color="#ef4444" style={{ opacity: 0.8, marginBottom: '16px' }} />
        <h2 style={{ fontSize: '20px', fontWeight: 900, color: 'var(--text)', margin: 0 }}>Admin Settings Access Restricted</h2>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '8px', lineHeight: 1.5 }}>
          System Settings &amp; Admin Panel are strictly available to Administrator accounts only.
        </p>
        <button className="btn btn-g" style={{ marginTop: '20px' }} onClick={() => window.location.href = '/'}>
          Return to Dashboard
        </button>
      </div>
    );
  }

  // ── State: Users ──
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
  // Second pass of user creation: the emailed code and the id Stytch gave us.
  const [otpMode, setOtpMode] = useState(false);
  const [methodId, setMethodId] = useState('');
  const [otpCode, setOtpCode] = useState('');

  // ── State: System Settings ──
  const [sysSettings, setSysSettings] = useState({
    smtp: {
      host: 'smtp.gmail.com',
      port: '587',
      user: '',
      pass: ''
    },
    org: {
      name: 'VGTC Logistics Management',
      phone: '+91 9812000000',
      address: 'Kosli / Jhajjar / Jharli'
    }
  });
  const [sysSaving, setSysSaving] = useState(false);

  useEffect(() => {
    fetchUsers();
    fetchWorkers();
    fetchSysSettings();
  }, []);

  const fetchSysSettings = async () => {
    try {
      const res = await ax.get('/settings');
      if (res.data) {
        setSysSettings(s => ({
          ...s,
          ...res.data,
          smtp: { ...s.smtp, ...(res.data.smtp || {}) },
          org: { ...s.org, ...(res.data.org || {}) }
        }));
      }
    } catch {}
  };

  const handleSaveSysSettings = async (e) => {
    e.preventDefault();
    setSysSaving(true);
    try {
      await ax.post('/settings', sysSettings);
      alert('System & Govt API Settings updated successfully!');
    } catch (err) {
      alert('Failed to save settings: ' + (err.response?.data?.error || err.message));
    } finally {
      setSysSaving(false);
    }
  };

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

  // Fuel stations are managed by the full FuelStationManager component now
  // (contact, rate, opening balance, bill-pending, statement export) — the
  // name-only CRUD that lived here went with the old tab body.

  const fetchUsers = async () => {
    setLoading(true);
    try { setUsers((await ax.get(API)).data); }
    catch { } finally { setLoading(false); }
  };

  /**
   * Creating a user takes two passes: send a code to the address, then create
   * with that code. This posted straight to /users with neither, so the server
   * answered "Email verification code is required" every single time.
   */
  const handleCreate = async e => {
    e.preventDefault(); setFormError(''); setBusy(true);
    try {
      if (!otpMode) {
        const res = await ax.post(`${API}/send-otp`, { email: form.email });
        setMethodId(res.data.methodId);
        setOtpMode(true);
        setFormError(`Verification code sent to ${form.email}. Enter it below to finish.`);
        return;
      }
      await ax.post(API, { ...form, otpCode, methodId });
      resetCreateForm();
      fetchUsers();
    } catch (e) { setFormError(e.response?.data?.error || 'Failed to create user'); }
    finally { setBusy(false); }
  };

  const resetCreateForm = () => {
    setForm({ name: '', username: '', password: '', role: 'user', email: '', isOtpEnabled: false, permissions: {} });
    setOtpMode(false); setMethodId(''); setOtpCode(''); setFormError('');
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




  return (
    <>
      <AnimatePresence>
        {delTarget && <DeleteConfirm u={delTarget} onClose={() => setDelTarget(null)} onConfirm={() => { setDelTarget(null); fetchUsers(); }} />}
      </AnimatePresence>

      <div style={{ padding: '0 20px 40px', maxWidth: '1280px', margin: '0 auto' }}>
        {/* ── Page Header ── */}
        <div className="page-hd" style={{ marginBottom: '20px' }}>
          <div>
            <h1 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Settings size={22} color="#6366f1" /> System Settings &amp; Admin Hub
            </h1>
            <p>Unified administration panel for users, permissions, fuel pumps, system statistics, and SMTP settings.</p>
          </div>
          <button className="btn btn-g btn-sm" onClick={fetchUsers}><RefreshCw size={14} className={loading ? 'ani-spin' : ''} /> Refresh</button>
        </div>

        {/* ── UNIFIED SETTINGS NAVIGATION TABS ── */}
        <div style={{ display: 'flex', gap: '8px', borderBottom: '2px solid var(--border)', marginBottom: '24px', overflowX: 'auto', paddingBottom: '4px' }}>
          {[
            { id: 'users', label: 'Users & Permissions', icon: Users, color: '#6366f1' },
            { id: 'profiles', label: 'Driver & Staff Profiles', icon: UserCircle, color: '#6366f1' },
            { id: 'firms', label: 'Firms & Vendors', icon: Briefcase, color: '#10b981' },
            { id: 'parties', label: 'Party Master', icon: Building2, color: '#8b5cf6' },
            { id: 'workers', label: 'Labour Workers', icon: Truck, color: '#10b981' },
            { id: 'fuel', label: 'Fuel Stations', icon: Fuel, color: '#3b82f6' },
            { id: 'system', label: 'SMTP Settings', icon: Globe, color: '#f59e0b' },
            { id: 'overview', label: 'System Overview & Fleet', icon: LayoutDashboard, color: '#8b5cf6' },
            { id: 'pl_sheet', label: 'Profit & Loss', icon: TrendingUp, color: '#ec4899' },
            { id: 'backup', label: 'Google Drive Backup', icon: Cloud, color: '#14b8a6' },
          ].map(t => {
            const isActive = activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 18px',
                  borderRadius: '10px 10px 0 0', border: 'none',
                  background: isActive ? t.color + '15' : 'transparent',
                  color: isActive ? t.color : 'var(--text-muted)',
                  fontWeight: isActive ? 800 : 600, fontSize: '13px',
                  cursor: 'pointer', borderBottom: isActive ? `3px solid ${t.color}` : '3px solid transparent',
                  transition: 'all 0.18s', whiteSpace: 'nowrap'
                }}
              >
                <t.icon size={16} /> {t.label}
              </button>
            );
          })}
        </div>

        {/* ── TAB 1: USERS & PERMISSIONS ── */}
        {activeTab === 'users' && (
          <div className="two-col" style={{ display: 'grid', gridTemplateColumns: '400px 1fr', gap: '18px', alignItems: 'start' }}>
            {/* User Form (Create/Edit) */}
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

                  {/* The "Email OTP Security" tick box used to sit here. It offered a
                      choice that did not exist: isOtpEnabled is never read at login, and
                      every new user is verified by an emailed code regardless. */}
                  {!editTarget && otpMode && (
                    <div style={{ marginTop: '4px', padding: '12px', borderRadius: '12px', border: '1px solid var(--primary)', background: 'rgba(99,102,241,0.05)' }}>
                      <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text)', marginBottom: '6px' }}>Verification Code</div>
                      <input className="fi" value={otpCode} onChange={e => setOtpCode(e.target.value.trim())}
                        placeholder="6-digit code sent to the email above" required />
                      <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', lineHeight: 1.4, marginTop: '6px' }}>
                        Sent to {form.email}. The account is created once this is verified.
                      </div>
                    </div>
                  )}

                  <div style={{ marginTop: '8px', padding: '12px', borderRadius: '12px', border: '1px solid var(--border)', background: 'rgba(0,0,0,0.05)' }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '10px' }}>
                      Location &amp; Module Access
                    </div>
                    <PermissionEditor
                      permissions={form.permissions}
                      onChange={next => setForm(f => ({ ...f, permissions: next }))}
                      users={users.filter(u => u.id !== editTarget)}
                    />
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
                    {(editTarget || otpMode) && (
                      <button type="button" className="btn btn-g" style={{ flex: 1 }} onClick={() => { setEditTarget(null); resetCreateForm(); }}>Cancel</button>
                    )}
                    <button type="submit" className="btn btn-p" style={{ flex: 2, padding: '11px' }} disabled={busy}>
                      {busy ? 'Processing...' : (editTarget ? <><Check size={14} /> Update User</> : (otpMode ? <><Check size={14} /> Verify & Create User</> : <><Plus size={14} /> Send Verification Code</>))}
                    </button>
                  </div>
                </form>
              </div>
            </div>

            {/* Users Table */}
            <div className="card">
              <div className="card-header">
                <div className="card-title-block">
                  <div className="card-icon" style={{ background: 'rgba(16,185,129,0.12)', color: '#10b981' }}><Users size={17} /></div>
                  <div className="card-title-text"><h3>All System Users</h3><p>{users.length} accounts</p></div>
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
          </div>
        )}

        {/* ── TAB 2: LABOUR WORKERS ── */}
        {/* Driver & staff records. These feed the attendance roll-call and the
            driver dropdown on vouchers, so photos matter here. */}
        {activeTab === 'profiles' && <StaffProfileModule role="admin" />}

        {activeTab === 'workers' && (
          <div className="card">
            <div className="card-header" style={{ borderBottom: '1px solid var(--border)' }}>
              <div className="card-title-block">
                <div className="card-icon" style={{ background: 'rgba(16,185,129,0.12)', color: '#10b981' }}><Truck size={17} /></div>
                <div className="card-title-text">
                  <h3>Labour Workers Management</h3>
                  <p>Workers who log in to the Labour Portal to update loading statuses</p>
                </div>
              </div>
              <a href="/labour" target="_blank" rel="noopener noreferrer" className="btn btn-g btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '6px', textDecoration: 'none' }}>
                <ExternalLink size={12} /> Open Labour Portal
              </a>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: '24px', padding: '20px' }}>
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

              <div>
                <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '14px' }}>Registered Workers ({workers.length})</div>
                {workers.length === 0 ? (
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', padding: '20px', textAlign: 'center', border: '1px dashed var(--border)', borderRadius: '10px' }}>No workers yet. Add one to get started.</div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '10px' }}>
                    {workers.map(w => (
                      <div key={w.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 14px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '10px' }}>
                        <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: `${GODOWN_COLOR[w.godown]}20`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Truck size={16} color={GODOWN_COLOR[w.godown] || '#6366f1'} />
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
        )}

        {/* ── TAB 3: FUEL STATIONS ──
            The full manager (contact, rate, opening balance, bill-pending,
            monthly statement export) replaces the old name-only list. */}
        {activeTab === 'fuel' && <FuelStationManager />}

        {/* ── FIRMS & VENDORS — tyre sellers, manual vendors, other firms ── */}
        {activeTab === 'firms' && <FirmManager />}

        {/* ── PARTY MASTER ── */}
        {activeTab === 'parties' && <PartyMaster />}

        {/* ── TAB 4: SYSTEM & GOVT API SETTINGS ── */}
        {activeTab === 'system' && (
          <form onSubmit={handleSaveSysSettings} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* ── SMTP Email & OTP Configuration Card ── */}
            <div className="card">
              <div className="card-header" style={{ borderBottom: '1px solid var(--border)' }}>
                <div className="card-title-block">
                  <div className="card-icon" style={{ background: 'rgba(99,102,241,0.12)', color: '#6366f1' }}><Mail size={18} /></div>
                  <div className="card-title-text">
                    <h3>SMTP &amp; Email OTP Server Settings</h3>
                    <p>Configure outgoing SMTP mail server for login 2FA OTP codes and notifications</p>
                  </div>
                </div>
              </div>
              <div style={{ padding: '20px' }}>
                <div className="fg fg-2" style={{ gap: '14px' }}>
                  <div className="field">
                    <label>SMTP Host</label>
                    <input className="fi" type="text" placeholder="smtp.gmail.com" value={sysSettings.smtp.host} onChange={e => setSysSettings({ ...sysSettings, smtp: { ...sysSettings.smtp, host: e.target.value } })} />
                  </div>

                  <div className="field">
                    <label>SMTP Port</label>
                    <input className="fi" type="text" placeholder="587" value={sysSettings.smtp.port} onChange={e => setSysSettings({ ...sysSettings, smtp: { ...sysSettings.smtp, port: e.target.value } })} />
                  </div>

                  <div className="field">
                    <label>Sender Email Address</label>
                    <input className="fi" type="email" placeholder="notifications@vgtc.in" value={sysSettings.smtp.user} onChange={e => setSysSettings({ ...sysSettings, smtp: { ...sysSettings.smtp, user: e.target.value } })} />
                  </div>

                  <div className="field">
                    <label>SMTP Password / App Password</label>
                    <input className="fi" type="password" placeholder="••••••••" value={sysSettings.smtp.pass} onChange={e => setSysSettings({ ...sysSettings, smtp: { ...sysSettings.smtp, pass: e.target.value } })} />
                  </div>
                </div>
              </div>
            </div>

            {/* ── Save Settings Button Bar ── */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button type="submit" className="btn btn-p" style={{ padding: '12px 28px', fontSize: '14px', fontWeight: 800 }} disabled={sysSaving}>
                {sysSaving ? 'Saving Settings...' : <><Save size={16} /> Save All System Settings</>}
              </button>
            </div>
          </form>
        )}

        {/* ── TAB 5: SYSTEM OVERVIEW & FLEET FINANCING ── */}
        {activeTab === 'overview' && (
          <AdminDashboard />
        )}

        {/* ── TAB 6: PROFIT & LOSS SHEET ── */}
        {activeTab === 'pl_sheet' && (
          <ProfitLossSheet />
        )}

        {/* ── TAB 7: GOOGLE DRIVE BACKUP ── */}
        {activeTab === 'backup' && (
          <AdminModule />
        )}

      </div>
    </>
  );
}