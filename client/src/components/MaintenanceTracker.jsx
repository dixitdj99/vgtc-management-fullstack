import React, { useState, useEffect, useCallback } from 'react';
import ax from '../api';
import { motion, AnimatePresence } from 'framer-motion';
import { Wrench, Plus, Calendar, MapPin, DollarSign, X, ChevronDown, Droplets, Disc, Lightbulb, Package, Settings, Zap, AlertTriangle, Shield, Search, Truck as TruckIcon } from 'lucide-react';
import TruckDiagram from './TruckDiagram';

const CATEGORY_META = {
  engine:       { icon: Settings,      color: '#f59e0b', label: 'Engine & Filters' },
  fluids:       { icon: Droplets,      color: '#06b6d4', label: 'Fluids & Oils' },
  transmission: { icon: Settings,      color: '#8b5cf6', label: 'Transmission & Drivetrain' },
  axle_hubs:    { icon: Disc,          color: '#ec4899', label: 'Axle & Hubs (Bearings/Greasing)' },
  suspension:   { icon: TruckIcon,     color: '#10b981', label: 'Suspension & Leaf Springs' },
  brakes:       { icon: AlertTriangle, color: '#ef4444', label: 'Brakes & Pressure System' },
  tyres:        { icon: Disc,          color: '#6366f1', label: 'Tyres & Rims' },
  electrical:   { icon: Zap,           color: '#eab308', label: 'Electrical, Lights & Sensors' },
  body:         { icon: Lightbulb,     color: '#14b8a6', label: 'Body, Glass & Cabin' },
  trailer:      { icon: TruckIcon,     color: '#a855f7', label: 'Trailer & Coupling' },
  tools:        { icon: Package,       color: '#64748b', label: 'Tools & Safety' },
  chassis:      { icon: Settings,      color: '#78716c', label: 'Chassis & Frame' },
  damage:       { icon: AlertTriangle, color: '#dc2626', label: 'Damage Log & Accidents' },
};

const statusBadge = (status, recurring) => {
  const map = {
    overdue:  { bg: 'rgba(239,68,68,0.1)', color: '#ef4444', border: 'rgba(239,68,68,0.3)', text: 'OVERDUE' },
    due_soon: { bg: 'rgba(245,158,11,0.1)', color: '#f59e0b', border: 'rgba(245,158,11,0.3)', text: 'DUE SOON' },
    ok:       { bg: 'rgba(16,185,129,0.1)', color: '#10b981', border: 'rgba(16,185,129,0.3)', text: 'OK' },
  };
  const s = map[status] || map.ok;
  return (
    <span style={{ display: 'inline-flex', gap: '4px', alignItems: 'center' }}>
      <span style={{ fontSize: '9px', fontWeight: 800, color: s.color, background: s.bg, border: `1px solid ${s.border}`, padding: '2px 8px', borderRadius: '20px' }}>{s.text}</span>
      {recurring && <span style={{ fontSize: '8px', fontWeight: 800, color: '#ef4444', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', padding: '2px 6px', borderRadius: '20px' }}>⚠ RECURRING</span>}
    </span>
  );
};

const VIEWS = [
  { id: 'side', label: 'Side Profile (Full Body)', img: '/assets/truck/side.png' },
  { id: 'front', label: 'Front Profile (Cabin/Engine)', img: '/assets/truck/front.png' },
  { id: 'rear', label: 'Rear Profile (Tail/Cargo)', img: '/assets/truck/rear.png' },
  { id: 'undercarriage', label: 'Undercarriage (Mechanical)', img: '/assets/truck/undercarriage.png' },
];

export default function MaintenanceTracker({ truckNo, onClose }) {
  const [summary, setSummary] = useState({});
  const [records, setRecords] = useState([]);
  const [catalog, setCatalog] = useState({});
  const [vehicle, setVehicle] = useState({});
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [expandedCat, setExpandedCat] = useState('');
  const [viewIdx, setViewIdx] = useState(0);
  const [form, setForm] = useState({ partId: '', date: new Date().toISOString().slice(0, 10), kmAtChange: '', cost: '', labourCost: '', vendor: '', notes: '', warrantyExpiry: '', warrantyClaimed: false, quantity: '1', damageDescription: '', avgBefore: '', avgAfter: '', manualPart: false, customPartName: '' });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [sumRes, recRes, catRes, vehRes] = await Promise.all([
        ax.get(`/maintenance/summary/${truckNo}`),
        ax.get(`/maintenance/vehicle/${truckNo}`),
        ax.get('/maintenance/parts-catalog'),
        ax.get('/vehicles')
      ]);
      setSummary(sumRes.data || {});
      setRecords(recRes.data || []);
      setCatalog(catRes.data || {});
      const v = Array.isArray(vehRes.data) ? vehRes.data.find(v => v.truckNo === truckNo) : null;
      if (v) setVehicle(v);
    } catch (e) { console.error('Maintenance fetch:', e); }
    setLoading(false);
  }, [truckNo]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.partId) return alert('Select a part');
    try {
      await ax.post('/maintenance', { ...form, truckNo });
      setShowForm(false);
      setForm({ partId: '', date: new Date().toISOString().slice(0, 10), kmAtChange: '', cost: '', labourCost: '', vendor: '', notes: '', warrantyExpiry: '', warrantyClaimed: false, quantity: '1', damageDescription: '', avgBefore: '', avgAfter: '' });
      fetchData();
    } catch (err) { alert('Save failed: ' + (err.response?.data?.error || err.message)); }
  };

  const handlePartClick = (partId) => {
    setForm(f => ({ ...f, partId }));
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this record?')) return;
    await ax.delete(`/maintenance/${id}`);
    fetchData();
  };

  const categories = {};
  Object.entries(catalog).forEach(([id, part]) => {
    if (!categories[part.category]) categories[part.category] = [];
    categories[part.category].push({ id, ...part });
  });

  const totalCost = records.reduce((s, r) => s + (r.cost || 0) + (r.labourCost || 0), 0);
  const warrantyClaims = records.filter(r => r.warrantyClaimed).length;
  const overdueCount = Object.values(summary).filter(s => s.status === 'overdue').length;
  const dueCount = Object.values(summary).filter(s => s.status === 'due_soon').length;
  const recurringCount = Object.values(summary).filter(s => s.recurring).length;

  if (loading) return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(2, 6, 23, 0.95)', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: '20px', backdropFilter: 'blur(10px)' }}>
      <div className="pulse-blue" style={{ width: '40px', height: '40px', background: '#3b82f6', borderRadius: '50%', boxShadow: '0 0 30px #3b82f6' }}></div>
      <div style={{ color: 'white', fontWeight: 900, fontSize: '18px', letterSpacing: '1px' }}>INITIALIZING DIAGNOSTICS...</div>
      <div style={{ color: '#64748b', fontSize: '12px' }}>Establishing secure connection to Fleet Cloud</div>
      <button onClick={fetchData} style={{ marginTop: '20px', background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', border: '1px solid #3b82f6', padding: '12px 24px', borderRadius: '30px', fontWeight: 900, cursor: 'pointer', fontSize: '12px' }}>
        RECONNECT SERVER
      </button>
    </div>
  );

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', overflowY: 'auto', padding: '16px' }}>
      <motion.div initial={{ y: 30, scale: 0.97 }} animate={{ y: 0, scale: 1 }}
        style={{ width: '100%', maxWidth: '960px', background: 'var(--bg-card)', borderRadius: '20px', border: '1px solid var(--border)', boxShadow: '0 40px 80px rgba(0,0,0,0.5)', overflow: 'hidden' }}>
        
        {/* Header */}
        <div style={{ background: 'linear-gradient(135deg, #1e293b, #0f172a)', padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(59,130,246,0.2)' }}>
          <div>
            <div style={{ fontSize: '18px', fontWeight: 900, color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ background: 'linear-gradient(135deg, #f59e0b, #ef4444)', padding: '8px', borderRadius: '10px' }}><Wrench size={18} color="white" /></div>
              Full Vehicle Maintenance — {truckNo}
            </div>
            <div style={{ fontSize: '10px', color: '#64748b', marginTop: '4px' }}>{Object.keys(catalog).length} trackable parts • {records.length} service records</div>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            {overdueCount > 0 && <span style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444', fontSize: '10px', fontWeight: 800, padding: '4px 10px', borderRadius: '20px', border: '1px solid rgba(239,68,68,0.3)' }}>🔴 {overdueCount}</span>}
            {dueCount > 0 && <span style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b', fontSize: '10px', fontWeight: 800, padding: '4px 10px', borderRadius: '20px', border: '1px solid rgba(245,158,11,0.3)' }}>🟡 {dueCount}</span>}
            {recurringCount > 0 && <span style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', fontSize: '10px', fontWeight: 800, padding: '4px 10px', borderRadius: '20px', border: '1px dashed rgba(239,68,68,0.4)' }}>⚠ {recurringCount} Recurring</span>}
            <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', padding: '8px', cursor: 'pointer', color: '#94a3b8' }}><X size={18} /></button>
          </div>
        </div>

        <div style={{ padding: '20px 24px' }}>
          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '10px', marginBottom: '20px' }}>
            {[
              { label: 'Total Spent', value: `₹${totalCost.toLocaleString()}`, color: '#10b981', icon: '💰' },
              { label: 'Parts Tracked', value: Object.keys(summary).length, color: '#3b82f6', icon: '🔧' },
              { label: 'Records', value: records.length, color: '#8b5cf6', icon: '📋' },
              { label: 'Warranty Claims', value: warrantyClaims, color: '#06b6d4', icon: '🛡️' },
              { label: 'Alerts', value: overdueCount + dueCount, color: overdueCount > 0 ? '#ef4444' : '#10b981', icon: overdueCount > 0 ? '🚨' : '✅' },
            ].map((s, i) => (
              <div key={i} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '12px', padding: '12px', textAlign: 'center' }}>
                <div style={{ fontSize: '16px' }}>{s.icon}</div>
                <div style={{ fontSize: '16px', fontWeight: 900, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: '9px', color: 'var(--text-muted)', fontWeight: 600 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Truck Diagram */}
          <div style={{ position: 'relative' }}>
            <TruckDiagram summary={summary} records={records} onPartClick={handlePartClick} vehicle={vehicle} viewIdx={viewIdx} setViewIdx={setViewIdx} />
            <button onClick={() => window.open(`https://www.google.com/search?q=${vehicle.make}+${vehicle.model}+truck+${VIEWS[viewIdx]?.id}+view+technical+blueprint+diagram&tbm=isch`, '_blank')} 
              style={{ position: 'absolute', top: '16px', right: '16px', background: 'rgba(59,130,246,0.2)', border: '1px solid #3b82f6', color: '#3b82f6', padding: '6px 12px', borderRadius: '8px', fontSize: '10px', fontWeight: 900, cursor: 'pointer', zIndex: 300, display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Search size={12} /> SEARCH {VIEWS[viewIdx]?.id.toUpperCase()} BLUEPRINTS
            </button>
          </div>

          {/* Add Button */}
          <button onClick={() => setShowForm(true)} style={{ width: '100%', margin: '16px 0', background: 'linear-gradient(135deg, #3b82f6, #2563eb)', color: 'white', border: 'none', padding: '12px', borderRadius: '12px', fontWeight: 800, fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
            <Plus size={16} /> Log Maintenance / Service / Damage
          </button>

          {/* Form */}
          <AnimatePresence>
            {showForm && (
              <motion.form initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                onSubmit={handleSubmit} style={{ overflow: 'hidden', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '14px', padding: '20px', marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px' }}>
                  <span style={{ fontWeight: 800, fontSize: '14px' }}>📝 New Service Record</span>
                  <button type="button" onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={16} /></button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                  <div className="field"><label>Part *</label>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      {!form.manualPart ? (
                        <select className="fi" value={form.partId} onChange={e => setForm({ ...form, partId: e.target.value })} required style={{ flex: 1 }}>
                          <option value="">Select part...</option>
                          {Object.entries(categories).map(([cat, parts]) => (
                            <optgroup key={cat} label={CATEGORY_META[cat]?.label || cat}>
                              {parts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </optgroup>
                          ))}
                        </select>
                      ) : (
                        <input className="fi" type="text" placeholder="Enter Part Name..." value={form.customPartName || ''} onChange={e => setForm({ ...form, customPartName: e.target.value, partId: 'custom' })} required style={{ flex: 1 }} />
                      )}
                      <button type="button" onClick={() => setForm({ ...form, manualPart: !form.manualPart, partId: '', customPartName: '' })} style={{ background: 'var(--bg-th)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0 8px', cursor: 'pointer', fontSize: '10px' }}>
                        {form.manualPart ? 'List' : 'Edit'}
                      </button>
                    </div>
                  </div>
                  <div className="field"><label>Date</label><input className="fi" type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></div>
                  <div className="field"><label>KM (Odometer)</label><input className="fi" type="number" placeholder="Reading" value={form.kmAtChange} onChange={e => setForm({ ...form, kmAtChange: e.target.value })} /></div>
                  <div className="field"><label>Part Cost ₹</label><input className="fi" type="number" placeholder="Part amount" value={form.cost} onChange={e => setForm({ ...form, cost: e.target.value })} /></div>
                  <div className="field"><label>Labour Cost ₹</label><input className="fi" type="number" placeholder="Labour" value={form.labourCost} onChange={e => setForm({ ...form, labourCost: e.target.value })} /></div>
                  <div className="field"><label>Vendor / Shop</label><input className="fi" type="text" placeholder="Where" value={form.vendor} onChange={e => setForm({ ...form, vendor: e.target.value })} /></div>
                  <div className="field"><label>Quantity</label><input className="fi" type="number" min="1" value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} /></div>
                  <div className="field"><label>Warranty Expiry</label><input className="fi" type="date" value={form.warrantyExpiry} onChange={e => setForm({ ...form, warrantyExpiry: e.target.value })} /></div>
                  
                  <div className="field" style={{ gridColumn: 'span 1' }}><label>Custom KM Interval</label><input className="fi" type="number" placeholder="Alert at X KM" value={form.customIntervalKm || ''} onChange={e => setForm({ ...form, customIntervalKm: e.target.value })} /></div>
                  <div className="field" style={{ gridColumn: 'span 1' }}><label>Custom Day Interval</label><input className="fi" type="number" placeholder="Alert at X Days" value={form.customIntervalDays || ''} onChange={e => setForm({ ...form, customIntervalDays: e.target.value })} /></div>

                  <div className="field" style={{ display: 'flex', alignItems: 'end', gap: '8px', paddingBottom: '4px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '12px' }}>
                      <input type="checkbox" checked={form.warrantyClaimed} onChange={e => setForm({ ...form, warrantyClaimed: e.target.checked })} />
                      <Shield size={14} color="#06b6d4" /> Warranty Claim
                    </label>
                  </div>
                  <div className="field"><label>Avg Before (km/l)</label><input className="fi" type="number" step="0.1" placeholder="Before service" value={form.avgBefore} onChange={e => setForm({ ...form, avgBefore: e.target.value })} /></div>
                  <div className="field"><label>Avg After (km/l)</label><input className="fi" type="number" step="0.1" placeholder="After service" value={form.avgAfter} onChange={e => setForm({ ...form, avgAfter: e.target.value })} /></div>
                </div>
                <div className="field" style={{ marginTop: '10px' }}><label>Damage Description / Notes</label><input className="fi" type="text" placeholder="What was damaged, cause, etc." value={form.damageDescription || form.notes} onChange={e => setForm({ ...form, notes: e.target.value, damageDescription: e.target.value })} /></div>
                <button type="submit" className="btn btn-p" style={{ width: '100%', marginTop: '14px' }}>Save Service Record</button>
              </motion.form>
            )}
          </AnimatePresence>

          {/* Categories */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {Object.entries(categories).map(([cat, parts]) => {
              const meta = CATEGORY_META[cat] || { icon: Wrench, color: '#64748b', label: cat };
              const Icon = meta.icon;
              const catParts = parts.filter(p => summary[p.id]);
              const isExp = expandedCat === cat;
              return (
                <div key={cat} style={{ border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
                  <div onClick={() => setExpandedCat(isExp ? '' : cat)} style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', background: isExp ? 'var(--bg-th)' : 'transparent' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ background: `${meta.color}15`, color: meta.color, padding: '5px', borderRadius: '8px' }}><Icon size={14} /></div>
                      <span style={{ fontWeight: 800, fontSize: '12px' }}>{meta.label}</span>
                      <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>{catParts.length}/{parts.length}</span>
                    </div>
                    <ChevronDown size={14} style={{ transform: isExp ? 'rotate(180deg)' : 'none', transition: '0.2s', color: 'var(--text-muted)' }} />
                  </div>
                  <AnimatePresence>
                    {isExp && (
                      <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} style={{ overflow: 'hidden' }}>
                        <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '8px' }}>
                          {parts.map(p => {
                            const d = summary[p.id];
                            return (
                              <div key={p.id} onClick={() => handlePartClick(p.id)}
                                style={{ padding: '10px', borderRadius: '10px', border: `1px solid ${d?.recurring ? 'rgba(239,68,68,0.4)' : d ? (d.status === 'overdue' ? 'rgba(239,68,68,0.3)' : 'var(--border)') : 'var(--border)'}`, cursor: 'pointer', background: d?.recurring ? 'rgba(239,68,68,0.03)' : 'var(--bg-card)', fontSize: '11px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                  <span style={{ fontWeight: 700 }}>{p.name}</span>
                                  {d ? statusBadge(d.status, d.recurring) : <span style={{ fontSize: '8px', color: '#475569' }}>—</span>}
                                </div>
                                {d && (
                                  <div style={{ fontSize: '9px', color: 'var(--text-muted)', display: 'grid', gap: '1px' }}>
                                    <span>{d.lastServiceDate} {d.lastServiceKm > 0 ? `• ${d.lastServiceKm.toLocaleString()} KM` : ''}</span>
                                    {(d.cost > 0 || d.labourCost > 0) && <span style={{ color: '#10b981' }}>₹{d.cost.toLocaleString()}{d.labourCost > 0 ? ` + ₹${d.labourCost.toLocaleString()} labour` : ''}</span>}
                                    {d.warrantyClaimed && <span style={{ color: '#06b6d4' }}>🛡️ Warranty Claimed</span>}
                                    {d.totalRecords > 1 && <span>Changed {d.totalRecords}x</span>}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>

          {/* Recent Records */}
          {records.length > 0 && (
            <div style={{ marginTop: '16px' }}>
              <div style={{ fontSize: '12px', fontWeight: 800, marginBottom: '10px' }}>📋 Service History ({records.length})</div>
              <div style={{ maxHeight: '250px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {records.slice(0, 30).map(r => (
                  <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: r.warrantyClaimed ? 'rgba(6,182,212,0.03)' : 'var(--bg)', borderRadius: '8px', border: `1px solid ${r.warrantyClaimed ? 'rgba(6,182,212,0.2)' : 'var(--border)'}`, fontSize: '11px' }}>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 800 }}>{r.partName}</span>
                      <span style={{ color: 'var(--text-muted)' }}>{r.date}</span>
                      {r.kmAtChange > 0 && <span style={{ color: '#3b82f6' }}>{r.kmAtChange.toLocaleString()} KM</span>}
                      {r.cost > 0 && <span style={{ color: '#10b981', fontWeight: 700 }}>₹{r.cost.toLocaleString()}</span>}
                      {r.labourCost > 0 && <span style={{ color: '#f59e0b' }}>+₹{r.labourCost.toLocaleString()}</span>}
                      {r.warrantyClaimed && <span style={{ color: '#06b6d4', fontSize: '9px' }}>🛡️</span>}
                      {r.quantity > 1 && <span style={{ color: 'var(--text-muted)' }}>x{r.quantity}</span>}
                      {r.avgBefore > 0 && r.avgAfter > 0 && (
                        <span style={{ color: r.avgAfter > r.avgBefore ? '#10b981' : '#ef4444', fontWeight: 700, fontSize: '10px' }}>
                          Avg: {r.avgBefore}→{r.avgAfter} {r.avgAfter > r.avgBefore ? '↑' : '↓'}
                        </span>
                      )}
                    </div>
                    <button onClick={() => handleDelete(r.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '10px' }}>✕</button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
