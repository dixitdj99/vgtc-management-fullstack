import { writeFileSync, mkdirSync } from 'fs';

/* ══════════  AuthContext.jsx  ══════════ */
const authCtx = `import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user,  setUser]  = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem('vgtc-token'));
  const [ready, setReady] = useState(false);

  // Set axios default auth header
  useEffect(() => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = 'Bearer ' + token;
      // Verify the token is still valid
      axios.get('http://localhost:5000/api/auth/me')
        .then(r => { setUser(r.data); })
        .catch(() => { logout(); })
        .finally(() => setReady(true));
    } else {
      delete axios.defaults.headers.common['Authorization'];
      setReady(true);
    }
  }, [token]);

  const login = async (username, password) => {
    const res = await axios.post('http://localhost:5000/api/auth/login', { username, password });
    const { token: t, user: u } = res.data;
    localStorage.setItem('vgtc-token', t);
    axios.defaults.headers.common['Authorization'] = 'Bearer ' + t;
    setToken(t);
    setUser(u);
    return u;
  };

  const logout = () => {
    localStorage.removeItem('vgtc-token');
    delete axios.defaults.headers.common['Authorization'];
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, ready }}>
      {children}
    </AuthContext.Provider>
  );
}`;

/* ══════════  LoginPage.jsx  ══════════ */
const loginPage = `import React, { useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { User, Lock, LogIn, Truck } from 'lucide-react';

export default function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async e => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(username, password);
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg)', fontFamily: '"Plus Jakarta Sans", sans-serif',
    }}>
      {/* Background glow */}
      <div style={{ position:'fixed', inset:0, overflow:'hidden', pointerEvents:'none', zIndex:0 }}>
        <div style={{ position:'absolute', top:'-20%', left:'30%', width:'600px', height:'600px',
          background:'radial-gradient(circle, rgba(99,102,241,0.12) 0%, transparent 65%)', filter:'blur(40px)' }}/>
        <div style={{ position:'absolute', bottom:'-10%', right:'20%', width:'400px', height:'400px',
          background:'radial-gradient(circle, rgba(16,185,129,0.08) 0%, transparent 65%)', filter:'blur(40px)' }}/>
      </div>

      <div style={{ position:'relative', zIndex:1, width:'100%', maxWidth:'420px', padding:'0 20px' }}>
        {/* Brand */}
        <div style={{ textAlign:'center', marginBottom:'36px' }}>
          <div style={{ width:'64px', height:'64px', borderRadius:'18px',
            background:'linear-gradient(135deg,#6366f1,#4f46e5)', display:'flex',
            alignItems:'center', justifyContent:'center', margin:'0 auto 16px',
            boxShadow:'0 8px 32px rgba(99,102,241,0.35)' }}>
            <Truck size={30} color="white"/>
          </div>
          <div style={{ fontSize:'26px', fontWeight:900, color:'var(--text)', letterSpacing:'-0.03em' }}>
            Vikas Goods
          </div>
          <div style={{ fontSize:'12px', fontWeight:600, color:'var(--text-muted)', marginTop:'4px' }}>
            Transport Management System
          </div>
        </div>

        {/* Card */}
        <div style={{ background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:'20px',
          padding:'32px 28px', boxShadow:'0 24px 60px rgba(0,0,0,0.4)' }}>
          <div style={{ fontSize:'17px', fontWeight:800, color:'var(--text)', marginBottom:'6px' }}>
            Sign in to your account
          </div>
          <div style={{ fontSize:'12px', color:'var(--text-muted)', marginBottom:'26px' }}>
            Enter your credentials to continue
          </div>

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom:'14px' }}>
              <label style={{ fontSize:'11px', fontWeight:700, color:'var(--text-muted)',
                textTransform:'uppercase', letterSpacing:'0.07em', display:'block', marginBottom:'6px' }}>
                Username
              </label>
              <div style={{ position:'relative' }}>
                <User size={14} style={{ position:'absolute', left:'12px', top:'50%',
                  transform:'translateY(-50%)', color:'var(--text-muted)' }}/>
                <input
                  type="text" value={username} onChange={e=>setUsername(e.target.value)}
                  placeholder="e.g. admin" autoFocus required
                  style={{ width:'100%', background:'var(--bg-input)', border:'1px solid var(--border)',
                    borderRadius:'10px', padding:'11px 12px 11px 36px', color:'var(--text)',
                    fontSize:'13.5px', outline:'none', transition:'border 0.18s',
                    fontFamily:'inherit' }}
                  onFocus={e=>e.target.style.borderColor='rgba(99,102,241,0.5)'}
                  onBlur={e=>e.target.style.borderColor='var(--border)'}
                />
              </div>
            </div>

            <div style={{ marginBottom:'22px' }}>
              <label style={{ fontSize:'11px', fontWeight:700, color:'var(--text-muted)',
                textTransform:'uppercase', letterSpacing:'0.07em', display:'block', marginBottom:'6px' }}>
                Password
              </label>
              <div style={{ position:'relative' }}>
                <Lock size={14} style={{ position:'absolute', left:'12px', top:'50%',
                  transform:'translateY(-50%)', color:'var(--text-muted)' }}/>
                <input
                  type="password" value={password} onChange={e=>setPassword(e.target.value)}
                  placeholder="••••••••" required
                  style={{ width:'100%', background:'var(--bg-input)', border:'1px solid var(--border)',
                    borderRadius:'10px', padding:'11px 12px 11px 36px', color:'var(--text)',
                    fontSize:'13.5px', outline:'none', transition:'border 0.18s',
                    fontFamily:'inherit' }}
                  onFocus={e=>e.target.style.borderColor='rgba(99,102,241,0.5)'}
                  onBlur={e=>e.target.style.borderColor='var(--border)'}
                />
              </div>
            </div>

            {error && (
              <div style={{ background:'rgba(244,63,94,0.1)', border:'1px solid rgba(244,63,94,0.25)',
                borderRadius:'10px', padding:'10px 14px', fontSize:'12.5px', color:'var(--danger)',
                fontWeight:600, marginBottom:'16px' }}>
                {error}
              </div>
            )}

            <button type="submit" disabled={loading} style={{
              width:'100%', padding:'13px', borderRadius:'12px', border:'none',
              background:'linear-gradient(135deg,#6366f1,#4f46e5)', color:'white',
              fontSize:'14px', fontWeight:800, cursor:'pointer', display:'flex',
              alignItems:'center', justifyContent:'center', gap:'8px',
              boxShadow:'0 4px 20px rgba(99,102,241,0.4)',
              opacity: loading ? 0.7 : 1, transition:'opacity 0.2s',
              fontFamily:'inherit',
            }}>
              {loading ? 'Signing in…' : <><LogIn size={16}/> Sign In</>}
            </button>
          </form>
        </div>

        <div style={{ textAlign:'center', marginTop:'18px', fontSize:'11px', color:'var(--text-muted)' }}>
          Default: <strong style={{ color:'var(--text-sub)' }}>admin</strong> / <strong style={{ color:'var(--text-sub)' }}>admin123</strong>
        </div>
      </div>
    </div>
  );
}`;

/* ══════════  AdminPage.jsx  ══════════ */
const adminPage = `import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Plus, Trash2, User, Lock, AlertTriangle, X, Check, RefreshCw, Crown, Users } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';

const API = 'http://localhost:5000/api/users';
const ROLES = ['user', 'admin'];
const ROLE_COLOR = { admin: '#6366f1', user: '#10b981' };
const ROLE_ICON = { admin: Crown, user: Users };

function DeleteConfirm({ u, onClose, onConfirm }) {
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try { await axios.delete(API + '/' + u.id); onConfirm(); }
    catch(e) { alert(e.response?.data?.error || 'Delete failed'); }
    finally { setBusy(false); }
  };
  return (
    <div style={{ position:'fixed',inset:0,zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',
      background:'rgba(0,0,0,0.72)',backdropFilter:'blur(6px)' }}>
      <motion.div initial={{opacity:0,scale:0.94}} animate={{opacity:1,scale:1}} exit={{opacity:0}}
        style={{ width:'340px',background:'var(--bg-card)',border:'1px solid rgba(244,63,94,0.25)',
          borderRadius:'16px',padding:'28px 24px',textAlign:'center' }}>
        <div style={{ width:'52px',height:'52px',borderRadius:'14px',background:'rgba(244,63,94,0.1)',
          display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 16px' }}>
          <AlertTriangle size={26} color="var(--danger)"/>
        </div>
        <div style={{ fontSize:'16px',fontWeight:800,color:'var(--text)',marginBottom:'8px' }}>Delete User?</div>
        <div style={{ fontSize:'12.5px',color:'var(--text-sub)',marginBottom:'22px' }}>
          <strong style={{ color:'var(--text)' }}>{u.name}</strong> (@{u.username}) will be permanently removed.
        </div>
        <div style={{ display:'flex',gap:'10px',justifyContent:'center' }}>
          <button className="btn btn-g" onClick={onClose}>Cancel</button>
          <button className="btn btn-d" onClick={go} disabled={busy}>
            {busy ? '...' : <><Trash2 size={13}/> Delete</>}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

export default function AdminPage() {
  const { user: me } = useAuth();
  const [users,     setUsers]     = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [creating,  setCreating]  = useState(false);
  const [delTarget, setDelTarget] = useState(null);
  const [form, setForm] = useState({ name:'', username:'', password:'', role:'user' });
  const [formError, setFormError] = useState('');

  useEffect(() => { fetchUsers(); }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try { setUsers((await axios.get(API)).data); }
    catch {} finally { setLoading(false); }
  };

  const handleCreate = async e => {
    e.preventDefault(); setFormError(''); setCreating(true);
    try {
      await axios.post(API, form);
      setForm({ name:'', username:'', password:'', role:'user' });
      fetchUsers();
    } catch(e) { setFormError(e.response?.data?.error || 'Failed to create user'); }
    finally { setCreating(false); }
  };

  const S = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <>
      <AnimatePresence>
        {delTarget && <DeleteConfirm u={delTarget} onClose={()=>setDelTarget(null)} onConfirm={()=>{ setDelTarget(null); fetchUsers(); }}/>}
      </AnimatePresence>

      <div>
        <div className="page-hd">
          <div>
            <h1><Shield size={20} color="#6366f1"/> Admin Panel</h1>
            <p>User accounts & permissions</p>
          </div>
          <button className="btn btn-g btn-sm" onClick={fetchUsers}><RefreshCw size={14}/> Refresh</button>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'340px 1fr', gap:'18px', alignItems:'start' }}>

          {/* ── Create User Form ── */}
          <div className="card">
            <div className="card-header">
              <div className="card-title-block">
                <div className="card-icon ci-indigo"><Plus size={17}/></div>
                <div className="card-title-text"><h3>Create User</h3><p>Add a new account</p></div>
              </div>
            </div>
            <div className="card-body">
              <form onSubmit={handleCreate} style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
                <div className="field">
                  <label>Full Name</label>
                  <input className="fi" type="text" placeholder="Ramesh Kumar" value={form.name} onChange={e=>S('name',e.target.value)} required/>
                </div>
                <div className="field">
                  <label><User size={11}/> Username</label>
                  <input className="fi" type="text" placeholder="ramesh" value={form.username} onChange={e=>S('username',e.target.value.toLowerCase().replace(/\\s/g,''))} required/>
                </div>
                <div className="field">
                  <label><Lock size={11}/> Password</label>
                  <input className="fi" type="password" placeholder="••••••••" value={form.password} onChange={e=>S('password',e.target.value)} required/>
                </div>
                <div className="field">
                  <label>Role</label>
                  <div style={{ display:'flex', gap:'8px' }}>
                    {ROLES.map(r => {
                      const RIcon = ROLE_ICON[r];
                      return (
                        <button key={r} type="button" onClick={()=>S('role',r)}
                          style={{ flex:1, padding:'9px 8px', borderRadius:'10px', border:'1px solid',
                            borderColor: form.role===r ? ROLE_COLOR[r] : 'var(--border)',
                            background: form.role===r ? ROLE_COLOR[r]+'18' : 'var(--bg-input)',
                            color: form.role===r ? ROLE_COLOR[r] : 'var(--text-muted)',
                            fontWeight:700, fontSize:'12px', display:'flex', alignItems:'center',
                            justifyContent:'center', gap:'6px', cursor:'pointer', transition:'all 0.15s',
                            fontFamily:'inherit' }}>
                          <RIcon size={13}/>{r.charAt(0).toUpperCase()+r.slice(1)}
                        </button>
                      );
                    })}
                  </div>
                </div>
                {formError && (
                  <div style={{ background:'rgba(244,63,94,0.08)', border:'1px solid rgba(244,63,94,0.2)',
                    borderRadius:'8px', padding:'8px 12px', fontSize:'12px', color:'var(--danger)', fontWeight:600 }}>
                    {formError}
                  </div>
                )}
                <button type="submit" className="btn btn-p" style={{ width:'100%', padding:'11px' }} disabled={creating}>
                  {creating ? 'Creating...' : <><Check size={14}/> Create User</>}
                </button>
              </form>
            </div>
          </div>

          {/* ── Users Table ── */}
          <div className="card">
            <div className="card-header">
              <div className="card-title-block">
                <div className="card-icon" style={{ background:'rgba(16,185,129,0.12)',color:'#10b981' }}><Users size={17}/></div>
                <div className="card-title-text"><h3>All Users</h3><p>{users.length} accounts</p></div>
              </div>
            </div>
            {loading ? (
              <div style={{ padding:'40px', textAlign:'center', color:'var(--text-muted)', fontSize:'12px' }}>Loading...</div>
            ) : (
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'13px' }}>
                  <thead>
                    <tr style={{ background:'var(--bg-th)' }}>
                      {['User', 'Username', 'Role', 'Actions'].map(h => (
                        <th key={h} style={{ padding:'10px 16px', textAlign:'left', fontSize:'10px',
                          fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase',
                          letterSpacing:'0.08em', borderBottom:'1px solid var(--border)', whiteSpace:'nowrap' }}>
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
                        <tr key={u.id} style={{ background: i%2===0?'var(--bg-row-even)':'var(--bg-row-odd)' }}>
                          <td style={{ padding:'12px 16px', borderBottom:'1px solid var(--border-row)' }}>
                            <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
                              <div style={{ width:'34px', height:'34px', borderRadius:'10px',
                                background: ROLE_COLOR[u.role] + '20',
                                display:'flex', alignItems:'center', justifyContent:'center',
                                fontWeight:900, fontSize:'14px', color:ROLE_COLOR[u.role] }}>
                                {u.name.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <div style={{ fontWeight:700, color:'var(--text)', fontSize:'13px' }}>{u.name}</div>
                                {isMe && <div style={{ fontSize:'9px', fontWeight:700, color:'var(--accent)', textTransform:'uppercase', letterSpacing:'0.08em' }}>You</div>}
                              </div>
                            </div>
                          </td>
                          <td style={{ padding:'12px 16px', borderBottom:'1px solid var(--border-row)', color:'var(--text-sub)', fontFamily:'monospace', fontWeight:600 }}>
                            @{u.username}
                          </td>
                          <td style={{ padding:'12px 16px', borderBottom:'1px solid var(--border-row)' }}>
                            <span style={{ display:'inline-flex', alignItems:'center', gap:'5px',
                              padding:'4px 10px', borderRadius:'6px', fontSize:'11px', fontWeight:700,
                              background: ROLE_COLOR[u.role] + '18', color: ROLE_COLOR[u.role] }}>
                              <RIcon size={11}/> {u.role.charAt(0).toUpperCase()+u.role.slice(1)}
                            </span>
                          </td>
                          <td style={{ padding:'12px 16px', borderBottom:'1px solid var(--border-row)' }}>
                            {!isMe ? (
                              <button className="btn btn-d btn-sm btn-icon" onClick={()=>setDelTarget(u)} title="Delete user">
                                <Trash2 size={13}/>
                              </button>
                            ) : (
                              <span style={{ fontSize:'11px', color:'var(--text-muted)' }}>—</span>
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
        <div className="card" style={{ marginTop:'18px' }}>
          <div className="card-header">
            <div className="card-title-block">
              <div className="card-icon" style={{ background:'rgba(245,158,11,0.12)',color:'#f59e0b' }}><Shield size={17}/></div>
              <div className="card-title-text"><h3>Permission Levels</h3><p>What each role can do</p></div>
            </div>
          </div>
          <div style={{ padding:'16px 20px', display:'grid', gridTemplateColumns:'1fr 1fr', gap:'14px' }}>
            {[
              { role:'User', color:'#10b981', perms:['View Loading Receipts','Create Loading Receipts','Edit Loading Receipts','View Vouchers', 'Create Vouchers', 'Edit Vouchers', 'View Balance Sheet'] },
              { role:'Admin', color:'#6366f1', perms:['Everything a User can do','Delete Loading Receipts','Delete Vouchers','Access Admin Panel','Create & Delete Users'] },
            ].map(({ role, color, perms }) => (
              <div key={role} style={{ background:'var(--bg-input)', borderRadius:'12px', padding:'16px' }}>
                <div style={{ fontSize:'13px', fontWeight:800, color, marginBottom:'12px', display:'flex', alignItems:'center', gap:'7px' }}>
                  {role === 'Admin' ? <Crown size={14}/> : <Users size={14}/>} {role}
                </div>
                {perms.map(p => (
                  <div key={p} style={{ display:'flex', alignItems:'center', gap:'7px', marginBottom:'6px', fontSize:'12.5px', color:'var(--text-sub)' }}>
                    <Check size={12} color={color}/> {p}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}`;

mkdirSync('B:/VGTC Managemet/client/src/auth', { recursive: true });
mkdirSync('B:/VGTC Managemet/client/src/pages', { recursive: true });

writeFileSync('B:/VGTC Managemet/client/src/auth/AuthContext.jsx', authCtx, 'utf8');
writeFileSync('B:/VGTC Managemet/client/src/pages/LoginPage.jsx', loginPage, 'utf8');
writeFileSync('B:/VGTC Managemet/client/src/pages/AdminPage.jsx', adminPage, 'utf8');
console.log('Auth files written OK');
