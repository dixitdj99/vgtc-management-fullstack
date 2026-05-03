import React, { useState, useEffect } from 'react';
import ax from '../api';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Plus, Trash2, Building2, Users, Check, X, RefreshCw, CreditCard, Eye, EyeOff, Edit, Power, ChevronDown, ChevronRight, Package, AlertCircle } from 'lucide-react';

const PLAN_COLORS = { free: '#6b7280', basic: '#3b82f6', premium: '#f59e0b', enterprise: '#8b5cf6' };
const ALL_MODULES = ['lr','voucher','balance','stock','cashbook','vehicle','diesel','mileage','pay','sell','invoice','loading_status','backup'];
const MODULE_LABELS = { lr:'Loading Receipt', voucher:'Voucher', balance:'Balance Sheet', stock:'Stock', cashbook:'Cashbook', vehicle:'Vehicle', diesel:'Diesel', mileage:'Mileage', pay:'Pay', sell:'Sell', invoice:'Invoice', loading_status:'Loading Status', backup:'Backup' };

export default function SuperAdminPage() {
  const [orgs, setOrgs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editOrg, setEditOrg] = useState(null);
  const [expandedOrg, setExpandedOrg] = useState(null);
  const [form, setForm] = useState({ name:'', slug:'', address:'', contact:'', email:'', gstin:'', panNo:'', plan:'free', enabledModules:['lr','voucher','balance'], locations:[] });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [locForm, setLocForm] = useState({ id:'', label:'', plantKey:'jksuper', godownKey:'', color:'#6366f1' });

  useEffect(() => { fetchOrgs(); }, []);
  const fetchOrgs = async () => { setLoading(true); try { setOrgs((await ax.get('/orgs')).data); } catch{} finally { setLoading(false); } };

  const S = (k,v) => setForm(f => ({ ...f, [k]: v }));
  const toggleModule = (m) => {
    setForm(f => {
      const mods = f.enabledModules.includes(m) ? f.enabledModules.filter(x=>x!==m) : [...f.enabledModules, m];
      return { ...f, enabledModules: mods };
    });
  };
  const addLocation = () => {
    if (!locForm.id || !locForm.label) return;
    setForm(f => ({ ...f, locations: [...f.locations, { ...locForm }] }));
    setLocForm({ id:'', label:'', plantKey:'jksuper', godownKey:'', color:'#6366f1' });
  };
  const removeLocation = (idx) => setForm(f => ({ ...f, locations: f.locations.filter((_,i)=>i!==idx) }));

  const handleSubmit = async (e) => {
    e.preventDefault(); setBusy(true); setErr('');
    try {
      if (editOrg) { await ax.patch(`/orgs/${editOrg.id}`, form); }
      else { await ax.post('/orgs', form); }
      setShowForm(false); setEditOrg(null);
      setForm({ name:'', slug:'', address:'', contact:'', email:'', gstin:'', panNo:'', plan:'free', enabledModules:['lr','voucher','balance'], locations:[] });
      fetchOrgs();
    } catch(e) { setErr(e.response?.data?.error || 'Failed'); }
    finally { setBusy(false); }
  };

  const toggleActive = async (org) => {
    try { await ax.patch(`/orgs/${org.id}`, { isActive: !org.isActive }); fetchOrgs(); }
    catch { alert('Failed to toggle'); }
  };

  const startEdit = (o) => {
    setEditOrg(o);
    setForm({ name:o.name, slug:o.slug, address:o.address||'', contact:o.contact||'', email:o.email||'', gstin:o.gstin||'', panNo:o.panNo||'', plan:o.plan||'free', enabledModules:o.enabledModules||[], locations:o.locations||[] });
    setShowForm(true);
  };

  const TH = { padding:'10px 14px', fontSize:'10px', fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.06em', background:'var(--bg-th)', borderBottom:'1px solid var(--border)', textAlign:'left' };
  const TD = { padding:'12px 14px', fontSize:'13px', color:'var(--text-sub)', borderBottom:'1px solid var(--border-row)', verticalAlign:'middle' };

  return (
    <div style={{ padding:'0 20px 40px' }}>
      <div className="page-hd">
        <div>
          <h1><Shield size={20} color="#f43f5e" /> Platform Administration</h1>
          <p>Manage organizations, plans, modules & payments</p>
        </div>
        <div style={{ display:'flex', gap:'8px' }}>
          <button className="btn btn-g btn-sm" onClick={fetchOrgs}><RefreshCw size={14} className={loading?'ani-spin':''} /> Refresh</button>
          <button className="btn btn-a btn-sm" onClick={() => { setShowForm(true); setEditOrg(null); setForm({ name:'',slug:'',address:'',contact:'',email:'',gstin:'',panNo:'',plan:'free',enabledModules:['lr','voucher','balance'],locations:[] }); }}><Plus size={14} /> New Organization</button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display:'flex', gap:'12px', marginBottom:'18px', flexWrap:'wrap' }}>
        {[
          { label:'Total Orgs', val:orgs.length, color:'#6366f1' },
          { label:'Active', val:orgs.filter(o=>o.isActive).length, color:'#10b981' },
          { label:'Inactive', val:orgs.filter(o=>!o.isActive).length, color:'#f43f5e' },
          { label:'Enterprise', val:orgs.filter(o=>o.plan==='enterprise').length, color:'#8b5cf6' },
        ].map(s => (
          <div key={s.label} style={{ flex:'1 1 120px', background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:'12px', padding:'12px 16px' }}>
            <div style={{ fontSize:'10px', fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase' }}>{s.label}</div>
            <div style={{ fontSize:'22px', fontWeight:900, color:s.color }}>{s.val}</div>
          </div>
        ))}
      </div>

      {/* Org Form Modal */}
      <AnimatePresence>
        {showForm && (
          <div style={{ position:'fixed', inset:0, zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,0.6)', backdropFilter:'blur(4px)' }} onClick={() => setShowForm(false)}>
            <motion.div initial={{ opacity:0, scale:0.95 }} animate={{ opacity:1, scale:1 }} exit={{ opacity:0, scale:0.95 }}
              onClick={e => e.stopPropagation()}
              style={{ width:'90%', maxWidth:'560px', maxHeight:'85vh', overflow:'auto', background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:'16px', padding:'28px' }}>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'20px' }}>
                <h2 style={{ fontSize:'18px', fontWeight:800 }}>{editOrg ? 'Edit Organization' : 'Create Organization'}</h2>
                <button style={{ background:'none', border:'none', color:'var(--text-muted)', cursor:'pointer' }} onClick={() => setShowForm(false)}><X size={20} /></button>
              </div>
              <form onSubmit={handleSubmit} style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px' }}>
                  <div className="field"><label>Org Name *</label><input className="fi" required value={form.name} onChange={e=>S('name',e.target.value)} placeholder="Acme Transport Co." /></div>
                  <div className="field"><label>Slug (URL-safe) *</label><input className="fi" required value={form.slug} onChange={e=>S('slug',e.target.value.toLowerCase().replace(/[^a-z0-9_]/g,''))} placeholder="acme" disabled={!!editOrg} /></div>
                </div>
                <div className="field"><label>Address</label><input className="fi" value={form.address} onChange={e=>S('address',e.target.value)} /></div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px' }}>
                  <div className="field"><label>Contact</label><input className="fi" value={form.contact} onChange={e=>S('contact',e.target.value)} /></div>
                  <div className="field"><label>Email</label><input className="fi" value={form.email} onChange={e=>S('email',e.target.value)} /></div>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px' }}>
                  <div className="field"><label>GSTIN</label><input className="fi" value={form.gstin} onChange={e=>S('gstin',e.target.value)} /></div>
                  <div className="field"><label>PAN</label><input className="fi" value={form.panNo} onChange={e=>S('panNo',e.target.value)} /></div>
                </div>

                {/* Plan */}
                <div className="field"><label>Plan</label>
                  <div style={{ display:'flex', gap:'6px' }}>
                    {['free','basic','premium','enterprise'].map(p => (
                      <button type="button" key={p} onClick={() => S('plan', p)} style={{
                        flex:1, padding:'8px', borderRadius:'8px', border:`1px solid ${form.plan===p ? PLAN_COLORS[p] : 'var(--border)'}`,
                        background: form.plan===p ? PLAN_COLORS[p]+'18' : 'var(--bg-input)', color: form.plan===p ? PLAN_COLORS[p] : 'var(--text-muted)',
                        fontWeight:700, fontSize:'11px', cursor:'pointer', textTransform:'capitalize', fontFamily:'inherit'
                      }}>{p}</button>
                    ))}
                  </div>
                </div>

                {/* Modules */}
                <div style={{ padding:'12px', borderRadius:'10px', border:'1px solid var(--border)', background:'rgba(0,0,0,0.03)' }}>
                  <div style={{ fontSize:'10px', fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', marginBottom:'8px' }}>Enabled Modules</div>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:'6px' }}>
                    {ALL_MODULES.map(m => (
                      <button type="button" key={m} onClick={() => toggleModule(m)} style={{
                        padding:'4px 10px', borderRadius:'6px', fontSize:'10px', fontWeight:700,
                        border:`1px solid ${form.enabledModules.includes(m) ? '#10b981' : 'var(--border)'}`,
                        background: form.enabledModules.includes(m) ? 'rgba(16,185,129,0.1)' : 'transparent',
                        color: form.enabledModules.includes(m) ? '#10b981' : 'var(--text-muted)', cursor:'pointer'
                      }}>{form.enabledModules.includes(m) ? '✓ ' : ''}{MODULE_LABELS[m]||m}</button>
                    ))}
                  </div>
                </div>

                {/* Locations */}
                <div style={{ padding:'12px', borderRadius:'10px', border:'1px solid var(--border)', background:'rgba(0,0,0,0.03)' }}>
                  <div style={{ fontSize:'10px', fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', marginBottom:'8px' }}>Locations ({form.locations.length})</div>
                  {form.locations.map((loc, i) => (
                    <div key={i} style={{ display:'flex', alignItems:'center', gap:'8px', padding:'6px 10px', background:'var(--bg-card)', borderRadius:'8px', border:'1px solid var(--border)', marginBottom:'4px' }}>
                      <span style={{ width:'8px', height:'8px', borderRadius:'50%', background:loc.color }} />
                      <span style={{ flex:1, fontSize:'12px', fontWeight:600 }}>{loc.label} <span style={{ color:'var(--text-muted)', fontSize:'10px' }}>({loc.id})</span></span>
                      <button type="button" onClick={() => removeLocation(i)} style={{ background:'none', border:'none', color:'var(--text-muted)', cursor:'pointer' }}><X size={12} /></button>
                    </div>
                  ))}
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'6px', marginTop:'8px' }}>
                    <input className="fi" placeholder="ID (kosli)" value={locForm.id} onChange={e => setLocForm(f=>({...f, id:e.target.value.toLowerCase().replace(/\s/g,'_')}))} style={{ fontSize:'11px' }} />
                    <input className="fi" placeholder="Label" value={locForm.label} onChange={e => setLocForm(f=>({...f, label:e.target.value}))} style={{ fontSize:'11px' }} />
                    <button type="button" className="btn btn-g btn-sm" onClick={addLocation}><Plus size={12} /> Add</button>
                  </div>
                </div>

                {err && <div style={{ background:'rgba(244,63,94,0.1)', padding:'8px 12px', borderRadius:'8px', fontSize:'12px', color:'#f43f5e', fontWeight:600 }}>{err}</div>}
                <button type="submit" className="btn btn-a" style={{ padding:'12px' }} disabled={busy}>
                  {busy ? '...' : editOrg ? <><Check size={14} /> Update Organization</> : <><Plus size={14} /> Create Organization</>}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Orgs Table */}
      <div className="card">
        <div className="card-header">
          <div className="card-title-block">
            <div className="card-icon" style={{ background:'rgba(99,102,241,0.1)', color:'#6366f1' }}><Building2 size={17} /></div>
            <div className="card-title-text"><h3>Organizations</h3><p>{orgs.length} registered</p></div>
          </div>
        </div>
        {loading ? (
          <div style={{ padding:'40px', textAlign:'center', color:'var(--text-muted)' }}>Loading...</div>
        ) : (
          <div className="tbl-wrap">
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead><tr>
                {['','Organization','Slug','Plan','Modules','Locations','Status','Actions'].map(h => <th key={h} style={TH}>{h}</th>)}
              </tr></thead>
              <tbody>
                {orgs.map((o, i) => (
                  <React.Fragment key={o.id}>
                    <tr style={{ background: i%2===0 ? 'var(--bg-row-even)' : 'var(--bg-row-odd)', cursor:'pointer' }}
                      onClick={() => setExpandedOrg(expandedOrg===o.id ? null : o.id)}>
                      <td style={TD}>{expandedOrg===o.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</td>
                      <td style={{ ...TD, fontWeight:700, color:'var(--text)' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                          <div style={{ width:'28px', height:'28px', borderRadius:'8px', background:PLAN_COLORS[o.plan]+'20', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:900, fontSize:'12px', color:PLAN_COLORS[o.plan] }}>{o.name?.charAt(0)}</div>
                          {o.name}
                        </div>
                      </td>
                      <td style={{ ...TD, fontFamily:'monospace', fontWeight:600, color:'var(--accent)' }}>@{o.slug}</td>
                      <td style={TD}><span style={{ padding:'3px 8px', borderRadius:'6px', fontSize:'10px', fontWeight:700, background:PLAN_COLORS[o.plan]+'18', color:PLAN_COLORS[o.plan], textTransform:'capitalize' }}>{o.plan}</span></td>
                      <td style={{ ...TD, fontSize:'12px' }}>{o.enabledModules?.length || 0} modules</td>
                      <td style={{ ...TD, fontSize:'12px' }}>{o.locations?.length || 0} locations</td>
                      <td style={TD}>
                        <span style={{ padding:'3px 8px', borderRadius:'6px', fontSize:'10px', fontWeight:700, background: o.isActive ? 'rgba(16,185,129,0.1)' : 'rgba(244,63,94,0.1)', color: o.isActive ? '#10b981' : '#f43f5e' }}>
                          {o.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td style={TD} onClick={e => e.stopPropagation()}>
                        <div style={{ display:'flex', gap:'6px' }}>
                          <button className="btn btn-g btn-sm btn-icon" title="Edit" onClick={() => startEdit(o)}><Edit size={13} /></button>
                          <button className={`btn btn-sm btn-icon ${o.isActive ? 'btn-d' : 'btn-g'}`} title={o.isActive ? 'Deactivate' : 'Activate'} onClick={() => toggleActive(o)}><Power size={13} /></button>
                        </div>
                      </td>
                    </tr>
                    {expandedOrg===o.id && (
                      <tr><td colSpan={8} style={{ padding:'16px 20px', background:'var(--bg)', borderBottom:'2px solid var(--border)' }}>
                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'16px' }}>
                          <div>
                            <div style={{ fontSize:'10px', fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', marginBottom:'6px' }}>Details</div>
                            <div style={{ fontSize:'12px', color:'var(--text-sub)', lineHeight:1.8 }}>
                              <div><strong>Contact:</strong> {o.contact || '—'}</div>
                              <div><strong>Email:</strong> {o.email || '—'}</div>
                              <div><strong>GSTIN:</strong> {o.gstin || '—'}</div>
                              <div><strong>PAN:</strong> {o.panNo || '—'}</div>
                              <div><strong>Max Users:</strong> {o.maxUsers === -1 ? 'Unlimited' : o.maxUsers}</div>
                            </div>
                          </div>
                          <div>
                            <div style={{ fontSize:'10px', fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', marginBottom:'6px' }}>Enabled Modules</div>
                            <div style={{ display:'flex', flexWrap:'wrap', gap:'4px' }}>
                              {(o.enabledModules||[]).map(m => (
                                <span key={m} style={{ padding:'2px 8px', borderRadius:'4px', fontSize:'10px', fontWeight:600, background:'rgba(16,185,129,0.1)', color:'#10b981' }}>{MODULE_LABELS[m]||m}</span>
                              ))}
                            </div>
                          </div>
                          <div>
                            <div style={{ fontSize:'10px', fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', marginBottom:'6px' }}>Locations</div>
                            {(o.locations||[]).map((loc,i) => (
                              <div key={i} style={{ display:'flex', alignItems:'center', gap:'6px', marginBottom:'4px' }}>
                                <span style={{ width:'6px', height:'6px', borderRadius:'50%', background:loc.color }} />
                                <span style={{ fontSize:'12px', fontWeight:600 }}>{loc.label}</span>
                                <span style={{ fontSize:'10px', color:'var(--text-muted)' }}>({loc.plantKey}{loc.godownKey ? '/'+loc.godownKey : ''})</span>
                              </div>
                            ))}
                          </div>
                        </div>
                        {/* Payments */}
                        {(o.payments||[]).length > 0 && (
                          <div style={{ marginTop:'12px' }}>
                            <div style={{ fontSize:'10px', fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', marginBottom:'6px' }}>Payment History</div>
                            {o.payments.map((p,i) => (
                              <div key={i} style={{ display:'flex', gap:'10px', alignItems:'center', padding:'6px 10px', background:'var(--bg-card)', borderRadius:'6px', marginBottom:'4px', fontSize:'12px' }}>
                                <span style={{ fontWeight:700 }}>₹{p.amount}</span>
                                <span style={{ color:'var(--text-muted)' }}>UTR: {p.utrNumber || '—'}</span>
                                <span style={{ padding:'2px 6px', borderRadius:'4px', fontSize:'9px', fontWeight:700, background: p.status==='verified' ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)', color: p.status==='verified' ? '#10b981' : '#f59e0b' }}>{p.status}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </td></tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* UPI Payment Info */}
      <div className="card" style={{ marginTop:'18px' }}>
        <div className="card-header">
          <div className="card-title-block">
            <div className="card-icon" style={{ background:'rgba(16,185,129,0.1)', color:'#10b981' }}><CreditCard size={17} /></div>
            <div className="card-title-text"><h3>Payment Settings</h3><p>UPI-based payments (0% charges)</p></div>
          </div>
        </div>
        <div style={{ padding:'20px', fontSize:'13px', color:'var(--text-sub)' }}>
          <p>Organizations pay via <strong>UPI</strong> (zero transaction fees). You verify payments manually from the org's expanded row above.</p>
          <p style={{ marginTop:'8px', color:'var(--text-muted)', fontSize:'12px' }}>To record a payment: expand an org → add payment with UTR number → verify to upgrade plan.</p>
        </div>
      </div>
    </div>
  );
}
