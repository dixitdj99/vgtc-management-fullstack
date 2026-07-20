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
  const [err, setErr] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setErr('');
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
    } catch (e) {
      console.error('Maintenance fetch error:', e);
      setErr(e.response?.data?.error || 'Failed to connect to diagnostics server.');
    } finally {
      setLoading(false);
    }
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
  const isLeyland = vehicle?.make?.toLowerCase().includes('leyland');
  const isTata = vehicle?.make?.toLowerCase().includes('tata');

  Object.entries(catalog).forEach(([id, part]) => {
    // Filter out parts of other brands
    if (isLeyland && part.vehicleModel?.toLowerCase().includes('tata')) {
      return;
    }
    if (isTata && part.vehicleModel?.toLowerCase().includes('leyland')) {
      return;
    }
    // If the vehicle brand is neither Tata nor Leyland, exclude brand-specific parts
    if (!isLeyland && !isTata && part.vehicleModel) {
      return;
    }

    if (!categories[part.category]) categories[part.category] = [];
    categories[part.category].push({ id, ...part });
  });

  const selectedPart = form.partId && catalog ? catalog[form.partId] : null;

  const totalCost = records.reduce((s, r) => s + (r.cost || 0) + (r.labourCost || 0), 0);
  const warrantyClaims = records.filter(r => r.warrantyClaimed).length;
  const overdueCount = Object.values(summary || {}).filter(s => s?.status === 'overdue').length;
  const dueCount = Object.values(summary || {}).filter(s => s?.status === 'due_soon').length;
  const recurringCount = Object.values(summary || {}).filter(s => s?.recurring).length;
  if (loading) return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.4)', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: '12px', backdropFilter: 'blur(4px)' }}>
      <div style={{ background: 'var(--bg-card)', padding: '24px 40px', borderRadius: '16px', border: '1px solid var(--border)', textAlign: 'center', boxShadow: '0 20px 40px rgba(0,0,0,0.15)' }}>
        <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text)', marginBottom: '4px' }}>Loading Maintenance Tracker...</div>
        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Fetching vehicle service history for {truckNo}</div>
        {err && <div style={{ color: 'var(--danger)', fontSize: '12px', marginTop: '10px', fontWeight: 700 }}>⚠️ {err}</div>}
      </div>
    </div>
  );

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15, 23, 42, 0.5)', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', overflowY: 'auto', padding: '24px 16px' }}>
      <motion.div initial={{ y: 20, scale: 0.98 }} animate={{ y: 0, scale: 1 }}
        style={{ width: '100%', maxWidth: '960px', background: 'var(--bg-card)', borderRadius: '20px', border: '1px solid var(--border)', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', overflow: 'hidden' }}>
        
        {/* Header */}
        <div style={{ padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', background: 'var(--bg-th)' }}>
          <div>
            <div style={{ fontSize: '18px', fontWeight: 900, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ background: 'var(--primary)', padding: '8px', borderRadius: '10px', color: 'white', display: 'flex' }}><Wrench size={18} /></div>
              Vehicle Maintenance — {truckNo}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>{Object.keys(catalog).length} parts tracked • {records.length} total service records</div>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {overdueCount > 0 && <span style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', fontSize: '11px', fontWeight: 800, padding: '4px 10px', borderRadius: '20px', border: '1px solid rgba(239,68,68,0.2)' }}>🔴 {overdueCount} Overdue</span>}
            {dueCount > 0 && <span style={{ background: 'rgba(245,158,11,0.1)', color: '#f59e0b', fontSize: '11px', fontWeight: 800, padding: '4px 10px', borderRadius: '20px', border: '1px solid rgba(245,158,11,0.2)' }}>🟡 {dueCount} Due Soon</span>}
            <button onClick={onClose} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '10px', padding: '8px', cursor: 'pointer', color: 'var(--text)' }}><X size={18} /></button>
          </div>
        </div>

        <div style={{ padding: '20px 24px' }}>
          {/* Summary KPI Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '20px' }}>
            {[
              { label: 'Total Maintenance Spent', value: `₹${totalCost.toLocaleString()}`, color: '#10b981' },
              { label: 'Parts Monitored', value: Object.keys(summary || {}).length, color: '#3b82f6' },
              { label: 'Service Records', value: records.length, color: '#8b5cf6' },
              { label: 'Warranty Claims', value: warrantyClaims, color: '#06b6d4' },
              { label: 'Alert Status', value: overdueCount > 0 ? `${overdueCount} Overdue` : 'All Good', color: overdueCount > 0 ? '#ef4444' : '#10b981' },
            ].map((s, i) => (
              <div key={i} style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '14px', padding: '14px' }}>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.label}</div>
                <div style={{ fontSize: '18px', fontWeight: 900, color: s.color, marginTop: '4px' }}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* Simple Truck Layout Visualizer */}
          <div style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '16px', padding: '16px', marginBottom: '20px' }}>
            <TruckDiagram summary={summary} records={records} onPartClick={handlePartClick} vehicle={vehicle} viewIdx={viewIdx} setViewIdx={setViewIdx} />
          </div>

          {/* Action Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: 'var(--text)' }}>Maintenance & Diagnostic Categories</h3>
            <button onClick={() => setShowForm(!showForm)} style={{ background: 'var(--primary)', color: 'white', border: 'none', padding: '10px 18px', borderRadius: '10px', fontWeight: 800, fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Plus size={16} /> {showForm ? 'Cancel Entry' : 'Log Service Record'}
            </button>
          </div>

          {/* Service Entry Form */}
          <AnimatePresence>
            {showForm && (
              <motion.form initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                onSubmit={handleSubmit} style={{ overflow: 'hidden', background: 'var(--bg-th)', border: '1px solid var(--border)', borderRadius: '16px', padding: '20px', marginBottom: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px' }}>
                  <span style={{ fontWeight: 800, fontSize: '14px', color: 'var(--text)' }}>📝 Log Service Record</span>
                  <button type="button" onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={16} /></button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                  <div className="field"><label style={{ fontSize: '11px', fontWeight: 700 }}>Part *</label>
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
                      <button type="button" onClick={() => setForm({ ...form, manualPart: !form.manualPart, partId: '', customPartName: '' })} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0 8px', cursor: 'pointer', fontSize: '11px', fontWeight: 700 }}>
                        {form.manualPart ? 'List' : 'Custom'}
                      </button>
                    </div>
                  </div>
                  
                  <div className="field"><label style={{ fontSize: '11px', fontWeight: 700 }}>Service Date</label><input className="fi" type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></div>
                  <div className="field"><label style={{ fontSize: '11px', fontWeight: 700 }}>Odometer Reading (KM)</label><input className="fi" type="number" placeholder="KM reading" value={form.kmAtChange} onChange={e => setForm({ ...form, kmAtChange: e.target.value })} /></div>
                  <div className="field"><label style={{ fontSize: '11px', fontWeight: 700 }}>Part Cost ₹</label><input className="fi" type="number" placeholder="Part cost" value={form.cost} onChange={e => setForm({ ...form, cost: e.target.value })} /></div>
                  <div className="field"><label style={{ fontSize: '11px', fontWeight: 700 }}>Labour Cost ₹</label><input className="fi" type="number" placeholder="Labour charges" value={form.labourCost} onChange={e => setForm({ ...form, labourCost: e.target.value })} /></div>
                  <div className="field"><label style={{ fontSize: '11px', fontWeight: 700 }}>Vendor / Workshop</label><input className="fi" type="text" placeholder="Vendor name" value={form.vendor} onChange={e => setForm({ ...form, vendor: e.target.value })} /></div>
                  <div className="field"><label style={{ fontSize: '11px', fontWeight: 700 }}>Quantity</label><input className="fi" type="number" min="1" value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} /></div>
                  <div className="field"><label style={{ fontSize: '11px', fontWeight: 700 }}>Warranty Expiry</label><input className="fi" type="date" value={form.warrantyExpiry} onChange={e => setForm({ ...form, warrantyExpiry: e.target.value })} /></div>
                  
                  <div className="field" style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingTop: '20px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 700 }}>
                      <input type="checkbox" checked={form.warrantyClaimed} onChange={e => setForm({ ...form, warrantyClaimed: e.target.checked })} />
                      <Shield size={14} color="#06b6d4" /> Warranty Claim
                    </label>
                  </div>
                </div>
                <div className="field" style={{ marginTop: '12px' }}><label style={{ fontSize: '11px', fontWeight: 700 }}>Service Notes / Remarks</label><input className="fi" type="text" placeholder="Additional notes..." value={form.damageDescription || form.notes} onChange={e => setForm({ ...form, notes: e.target.value, damageDescription: e.target.value })} /></div>
                <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                  <button type="button" className="btn" style={{ border: '1px solid var(--border)', background: 'transparent' }} onClick={() => setShowForm(false)}>Cancel</button>
                  <button type="submit" className="btn btn-g" style={{ fontWeight: 800 }}>Save Record</button>
                </div>
              </motion.form>
            )}
          </AnimatePresence>

          {/* Categorized Parts List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
            {Object.entries(categories).map(([cat, parts]) => {
              const meta = CATEGORY_META[cat] || { icon: Wrench, color: '#64748b', label: cat };
              const Icon = meta.icon;
              const catParts = parts.filter(p => summary[p.id]);
              const isExp = expandedCat === cat;
              return (
                <div key={cat} style={{ border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden', background: 'var(--bg-card)' }}>
                  <div onClick={() => setExpandedCat(isExp ? '' : cat)} style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', background: isExp ? 'var(--bg-th)' : 'transparent' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ background: `${meta.color}15`, color: meta.color, padding: '6px', borderRadius: '8px', display: 'flex' }}><Icon size={14} /></div>
                      <span style={{ fontWeight: 800, fontSize: '13px', color: 'var(--text)' }}>{meta.label}</span>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', background: 'var(--bg-input)', padding: '2px 8px', borderRadius: '10px' }}>{catParts.length}/{parts.length} serviced</span>
                    </div>
                    <ChevronDown size={16} style={{ transform: isExp ? 'rotate(180deg)' : 'none', transition: '0.2s', color: 'var(--text-muted)' }} />
                  </div>
                  <AnimatePresence>
                    {isExp && (
                      <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} style={{ overflow: 'hidden' }}>
                        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '10px' }}>
                          {parts.map(p => {
                            const d = summary[p.id];
                            return (
                              <div key={p.id} onClick={() => handlePartClick(p.id)}
                                style={{ padding: '12px', borderRadius: '10px', border: `1px solid ${d?.recurring ? 'rgba(239,68,68,0.4)' : d ? (d.status === 'overdue' ? 'rgba(239,68,68,0.3)' : 'var(--border)') : 'var(--border)'}`, cursor: 'pointer', background: d?.recurring ? 'rgba(239,68,68,0.03)' : 'var(--bg-input)', fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                  <div>
                                    <span style={{ fontWeight: 800, color: 'var(--text)' }}>{p.name}</span>
                                    {p.partCode && <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'monospace', marginTop: '1px' }}>Code: {p.partCode}</div>}
                                  </div>
                                  {d ? statusBadge(d.status, d.recurring) : <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Not Serviced</span>}
                                </div>
                                {d && (
                                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '2px', borderTop: '1px dashed var(--border)', paddingTop: '6px', marginTop: '4px' }}>
                                    <span>Last: {d.lastServiceDate} {d.lastServiceKm > 0 ? `• ${d.lastServiceKm.toLocaleString()} KM` : ''}</span>
                                    {(d.cost > 0 || d.labourCost > 0) && <span style={{ color: '#10b981', fontWeight: 700 }}>₹{d.cost.toLocaleString()}{d.labourCost > 0 ? ` + ₹${d.labourCost.toLocaleString()} labour` : ''}</span>}
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

          {/* Service History Table */}
          {records.length > 0 && (
            <div>
              <h3 style={{ fontSize: '14px', fontWeight: 800, margin: '0 0 10px 0', color: 'var(--text)' }}>📋 Service History ({records.length})</h3>
              <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: '12px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-th)', borderBottom: '1px solid var(--border)' }}>
                      <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 800, color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase' }}>Date</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 800, color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase' }}>Part Name</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 800, color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase' }}>Odometer</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 800, color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase' }}>Part Cost</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 800, color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase' }}>Labour</th>
                      <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 800, color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.map(r => (
                      <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>{r.date}</td>
                        <td style={{ padding: '8px 12px', fontWeight: 800, color: 'var(--text)' }}>{r.partName}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--primary)', fontWeight: 700 }}>{r.kmAtChange ? `${r.kmAtChange.toLocaleString()} KM` : '—'}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', color: '#10b981', fontWeight: 700 }}>₹{(r.cost || 0).toLocaleString()}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', color: '#f59e0b', fontWeight: 700 }}>₹{(r.labourCost || 0).toLocaleString()}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                          <button onClick={() => handleDelete(r.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontWeight: 700 }}>Delete</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
