import React, { useState, useEffect } from 'react';
import ax from '../api';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Plus, Trash2, User, Lock, AlertTriangle, X, Check, RefreshCw, Crown, Users } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';

const API = `/users`;
const ROLES = ['user', 'admin'];
const ROLE_COLOR = { admin: '#6366f1', user: '#10b981' };
const ROLE_ICON = { admin: Crown, user: Users };

const MODULES = [
  { key: 'lr_kosli', label: 'Kosli LR' },
  { key: 'lr_jhajjar', label: 'Jhajjar LR' },
  { key: 'lr_jkl', label: 'JK Lakshmi LR' },
  { key: 'bill_kosli', label: 'Kosli Bill' },
  { key: 'bill_jhajjar', label: 'Jhajjar Bill' },
  { key: 'voucher_jksuper', label: 'JK Super Voucher' },
  { key: 'voucher_jkl_dump', label: 'JKL Dump Voucher' },
  { key: 'voucher_jkl', label: 'JK Lakshmi Voucher' },
  { key: 'balance_kosli', label: 'Balance - Kosli' },
  { key: 'balance_jhajjar', label: 'Balance - Jhajjar' },
  { key: 'balance_jksuper', label: 'Balance - JK Super' },
  { key: 'balance_jkl_dump', label: 'Balance - JKL Dump' },
  { key: 'balance_jkl', label: 'Balance - JK Lakshmi' },
  { key: 'stock_kosli', label: 'Kosli Stock' },
  { key: 'stock_jhajjar', label: 'Jhajjar Stock' },
  { key: 'stock_jkl', label: 'JK Lakshmi Stock' },
  { key: 'cashbook', label: 'Cashbook' },
  { key: 'pay', label: 'Pay Vehicles' },
  { key: 'invoice', label: 'Generate Invoice' },
  { key: 'vehicle', label: 'Vehicle Management' },
  { key: 'diesel', label: 'Diesel Module' },
  { key: 'mileage', label: 'Mileage Tracker' },
  { key: 'sell', label: 'Sell Management' },
  { key: 'loading_status', label: 'Loading Realtime' }
];

const HIERARCHY = [
  {
    id: 'jksuper',
    label: 'JK Super',
    godowns: [
      { id: 'kosli', label: 'Kosli Godown', modules: ['lr_kosli', 'bill_kosli', 'balance_kosli', 'stock_kosli'] },
      { id: 'jhajjar', label: 'Jhajjar Godown', modules: ['lr_jhajjar', 'bill_jhajjar', 'balance_jhajjar', 'stock_jhajjar'] },
      { id: 'common', label: 'Common JKS', modules: ['voucher_jksuper', 'balance_jksuper', 'cashbook', 'pay', 'invoice', 'vehicle', 'diesel', 'mileage', 'sell', 'loading_status'] }
    ]
  },
  {
    id: 'jklakshmi',
    label: 'JK Lakshmi',
    godowns: [
      { id: 'jkl_all', label: 'JK Lakshmi Modules', modules: ['lr_jkl', 'voucher_jkl_dump', 'voucher_jkl', 'balance_jkl_dump', 'balance_jkl', 'stock_jkl', 'cashbook', 'pay', 'invoice', 'vehicle', 'diesel', 'mileage', 'sell', 'loading_status'] }
    ]
  }
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

  useEffect(() => { fetchUsers(); }, []);

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
                    <input className="fi" type="password" placeholder={editTarget ? 'Leave blank to keep' : '••••••••'} value={form.password} onChange={e => S('password', e.target.value)} required={!editTarget} />
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
                    Plant & Godown Access
                  </div>
                  
                  {HIERARCHY.map(p => {
                    const isPlantAllowed = (form.permissions.allowedPlants || []).includes(p.id);
                    return (
                      <div key={p.id} style={{ marginBottom: '12px', borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginBottom: '8px' }}>
                          <input type="checkbox" checked={isPlantAllowed} onChange={e => {
                            const current = form.permissions.allowedPlants || [];
                            const next = e.target.checked ? [...current, p.id] : current.filter(id => id !== p.id);
                            SPerm('allowedPlants', next);
                          }} />
                          <span style={{ fontSize: '13px', fontWeight: 800, color: isPlantAllowed ? 'var(--accent)' : 'var(--text)' }}>{p.label} Access</span>
                        </label>

                        {isPlantAllowed && (
                          <div style={{ paddingLeft: '24px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {p.godowns.map(g => {
                              // If common or jkl_all, we don't need a godown checkbox, just modules
                              const isSpecial = g.id === 'common' || g.id === 'jkl_all';
                              const isGodownAllowed = isSpecial || (form.permissions.allowedGodowns || []).includes(g.id);
                              
                              return (
                                <div key={g.id}>
                                  {!isSpecial && (
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginBottom: '6px' }}>
                                      <input type="checkbox" checked={isGodownAllowed} onChange={e => {
                                        const current = form.permissions.allowedGodowns || [];
                                        const next = e.target.checked ? [...current, g.id] : current.filter(id => id !== g.id);
                                        SPerm('allowedGodowns', next);
                                      }} />
                                      <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)' }}>{g.label}</span>
                                    </label>
                                  )}

                                  {isGodownAllowed && (
                                    <div style={{ paddingLeft: isSpecial ? 0 : '20px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                      {isSpecial && <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--text-muted)', marginBottom: '4px', opacity: 0.6 }}>{g.label.toUpperCase()}</div>}
                                      {g.modules.map(mKey => (
                                        <PermissionToggle key={mKey} moduleKey={mKey} current={form.permissions[mKey]} onChange={SPerm} />
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
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
                      {['User', 'Username', 'Email', 'OTP', 'Role', 'Actions'].map(h => (
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
                        <tr key={u.id} style={{ background: i % 2 === 0 ? 'var(--bg-row-even)' : 'var(--bg-row-odd)' }}>
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
                              <button className="btn btn-g btn-sm btn-icon" title="Edit user" onClick={() => {
                                setEditTarget(u);
                                setForm({
                                  name: u.name, username: u.username, password: '', role: u.role,
                                  email: u.email || '', isOtpEnabled: !!u.isOtpEnabled,
                                  permissions: u.permissions || {}
                                });
                              }}>
                                <Users size={13} />
                              </button>
                              {!isMe && (
                                <button className="btn btn-d btn-sm btn-icon" onClick={() => setDelTarget(u)} title="Delete user">
                                  <Trash2 size={13} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}