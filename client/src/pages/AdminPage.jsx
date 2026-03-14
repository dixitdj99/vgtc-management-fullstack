import React, { useState, useEffect } from 'react';
import ax from '../api';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Plus, Trash2, User, Lock, AlertTriangle, X, Check, RefreshCw, Crown, Users } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';

const API = `/users`;
const ROLES = ['user', 'admin'];
const ROLE_COLOR = { admin: '#6366f1', user: '#10b981' };
const ROLE_ICON = { admin: Crown, user: Users };

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
          width: '340px', background: 'var(--bg-card)', border: '1px solid rgba(244,63,94,0.25)',
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
  const [creating, setCreating] = useState(false);
  const [delTarget, setDelTarget] = useState(null);
  const [form, setForm] = useState({ name: '', username: '', password: '', role: 'user' });
  const [formError, setFormError] = useState('');

  useEffect(() => { fetchUsers(); }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try { setUsers((await ax.get(API)).data); }
    catch { } finally { setLoading(false); }
  };

  const handleCreate = async e => {
    e.preventDefault(); setFormError(''); setCreating(true);
    try {
      await ax.post(API, form);
      setForm({ name: '', username: '', password: '', role: 'user' });
      fetchUsers();
    } catch (e) { setFormError(e.response?.data?.error || 'Failed to create user'); }
    finally { setCreating(false); }
  };

  const S = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <>
      <AnimatePresence>
        {delTarget && <DeleteConfirm u={delTarget} onClose={() => setDelTarget(null)} onConfirm={() => { setDelTarget(null); fetchUsers(); }} />}
      </AnimatePresence>

      <div>
        <div className="page-hd">
          <div>
            <h1><Shield size={20} color="#6366f1" /> Admin Panel</h1>
            <p>User accounts & permissions</p>
          </div>
          <button className="btn btn-g btn-sm" onClick={fetchUsers}><RefreshCw size={14} /> Refresh</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: '18px', alignItems: 'start' }}>

          {/* ── Create User Form ── */}
          <div className="card">
            <div className="card-header">
              <div className="card-title-block">
                <div className="card-icon ci-indigo"><Plus size={17} /></div>
                <div className="card-title-text"><h3>Create User</h3><p>Add a new account</p></div>
              </div>
            </div>
            <div className="card-body">
              <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div className="field">
                  <label>Full Name</label>
                  <input className="fi" type="text" placeholder="Ramesh Kumar" value={form.name} onChange={e => S('name', e.target.value)} required />
                </div>
                <div className="field">
                  <label><User size={11} /> Username</label>
                  <input className="fi" type="text" placeholder="ramesh" value={form.username} onChange={e => S('username', e.target.value.toLowerCase().replace(/\s/g, ''))} required />
                </div>
                <div className="field">
                  <label><Lock size={11} /> Password</label>
                  <input className="fi" type="password" placeholder="••••••••" value={form.password} onChange={e => S('password', e.target.value)} required />
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
                {formError && (
                  <div style={{
                    background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.2)',
                    borderRadius: '8px', padding: '8px 12px', fontSize: '12px', color: 'var(--danger)', fontWeight: 600
                  }}>
                    {formError}
                  </div>
                )}
                <button type="submit" className="btn btn-p" style={{ width: '100%', padding: '11px' }} disabled={creating}>
                  {creating ? 'Creating...' : <><Check size={14} /> Create User</>}
                </button>
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
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-th)' }}>
                      {['User', 'Username', 'Role', 'Actions'].map(h => (
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
                            {!isMe ? (
                              <button className="btn btn-d btn-sm btn-icon" onClick={() => setDelTarget(u)} title="Delete user">
                                <Trash2 size={13} />
                              </button>
                            ) : (
                              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>—</span>
                            )}
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

        {/* Permissions legend */}
        <div className="card" style={{ marginTop: '18px' }}>
          <div className="card-header">
            <div className="card-title-block">
              <div className="card-icon" style={{ background: 'rgba(245,158,11,0.12)', color: '#f59e0b' }}><Shield size={17} /></div>
              <div className="card-title-text"><h3>Permission Levels</h3><p>What each role can do</p></div>
            </div>
          </div>
          <div style={{ padding: '16px 20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            {[
              { role: 'User', color: '#10b981', perms: ['View Loading Receipts', 'Create Loading Receipts', 'Edit Loading Receipts', 'View Vouchers', 'Create Vouchers', 'Edit Vouchers', 'View Balance Sheet'] },
              { role: 'Admin', color: '#6366f1', perms: ['Everything a User can do', 'Delete Loading Receipts', 'Delete Vouchers', 'Access Admin Panel', 'Create & Delete Users'] },
            ].map(({ role, color, perms }) => (
              <div key={role} style={{ background: 'var(--bg-input)', borderRadius: '12px', padding: '16px' }}>
                <div style={{ fontSize: '13px', fontWeight: 800, color, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '7px' }}>
                  {role === 'Admin' ? <Crown size={14} /> : <Users size={14} />} {role}
                </div>
                {perms.map(p => (
                  <div key={p} style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '6px', fontSize: '12.5px', color: 'var(--text-sub)' }}>
                    <Check size={12} color={color} /> {p}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}